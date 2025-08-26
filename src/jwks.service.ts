import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import fs from "fs";
import jose from "jose";
import path from "path";

import {
  DEFAULT_ALGORITHM,
  DEFAULT_EXPIRATION_TIME,
  DEFAULT_KEYS_DIRECTORY,
  DEFAULT_MODULUS_LENGTH,
  DEFAULT_ROTATION_INTERVAL,
} from "./constants";
import { RSA_BASED_ALGORITHMS } from "./constants/algorithms.constants";
import { KEY_EXTENSION, METADATA_FILE } from "./constants/filenames.constants";
import { JwksModuleConfig } from "./interfaces";
import { JWKS_MODULE_CONFIG } from "./jwks.module";
import { Key, Metadata, metadataSchema } from "./schemas";

@Injectable()
export class JwksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JwksService.name);
  private readonly algorithm: NonNullable<JwksModuleConfig["algorithm"]>;
  private readonly modulusLength?: number;
  private readonly rotationInterval: number;
  private readonly expirationTime: number;
  private readonly keysDirectory: string;
  private readonly metadataPath: string;
  private metadata: Metadata = { keys: [] };
  private rotationTimeout: NodeJS.Timeout | null = null;
  private _privateKey: jose.CryptoKey | null = null;
  jwks: jose.JSONWebKeySet = { keys: [] };
  getKey = jose.createLocalJWKSet(this.jwks);

  constructor(
    @Inject(JWKS_MODULE_CONFIG)
    private readonly config?: JwksModuleConfig,
  ) {
    this.algorithm = this.config?.algorithm ?? DEFAULT_ALGORITHM;
    if (RSA_BASED_ALGORITHMS.includes(this.algorithm)) {
      this.modulusLength = this.config?.modulusLength ?? DEFAULT_MODULUS_LENGTH;
      if (this.modulusLength < 2048)
        throw new InternalServerErrorException(
          "RSA modulus length must be at least 2048 for security",
        );
    } else {
      if (this.config?.modulusLength) {
        this.logger.warn("Modulus length is ignored for non-RSA algorithms");
      }
    }

    this.rotationInterval =
      this.config?.rotationInterval ?? DEFAULT_ROTATION_INTERVAL;
    if (this.rotationInterval < 60000) {
      this.logger.warn("Key rotation interval is very short (< 1 minute)");
    }
    if (this.rotationInterval > 2147483647) {
      this.logger.warn(
        "Key rotation interval exceeds setTimeout limit (2147483647 ms / ~24.8 days)",
      );
    }

    this.expirationTime =
      this.config?.expirationTime ?? DEFAULT_EXPIRATION_TIME;
    if (this.expirationTime < this.rotationInterval * 2) {
      this.logger.warn(
        "Keys expiration time should be at least 2x rotation interval for safe overlap",
      );
    }

    this.keysDirectory = path.resolve(
      this.config?.keysDirectory ?? DEFAULT_KEYS_DIRECTORY,
    );
    this.metadataPath = path.join(this.keysDirectory, METADATA_FILE);
  }

  async onModuleInit() {
    // Ensure keys directory exists
    if (!fs.existsSync(this.keysDirectory)) {
      fs.mkdirSync(this.keysDirectory, { recursive: true });
    }

    // Load metadata and rotate keys
    this.loadMetadata();
    await this.rotateKeys();
  }

  onModuleDestroy() {
    if (this.rotationTimeout) {
      clearTimeout(this.rotationTimeout);
    }
  }

  get alg(): string {
    return this.algorithm;
  }

  get kid(): string {
    const activeKey = this.metadata.keys.find((key) => key.status === "active");
    if (!activeKey) {
      throw new InternalServerErrorException("No active key");
    }
    return activeKey.kid;
  }

  get privateKey(): jose.CryptoKey {
    if (!this._privateKey) {
      throw new InternalServerErrorException("No private key available");
    }
    return this._privateKey;
  }

  async rotateKeys(): Promise<void> {
    const now = Date.now();
    this.logger.log("Rotation started...");

    // Purge expired keys
    this.metadata.keys
      .filter(
        (key) =>
          key.status !== "expired" &&
          key.status !== "revoked" &&
          key.expiresAt <= now,
      )
      .forEach((key) => {
        key.status = "expired";
        key.expiredAt = now;
        this.logger.log(`Key expired: ${key.kid}`);
      });

    // Deprecate active key in metadata
    this.metadata.keys
      .filter((key) => key.status === "active")
      .forEach((key) => {
        key.status = "deprecated";
        key.deprecatedAt = now;
        this.logger.log(`Key deprecated: ${key.kid}`);
      });

    // Generate a new key pair
    const kid = randomUUID();
    const { privateKey, publicKey } = await jose.generateKeyPair(
      this.algorithm,
      {
        modulusLength: [
          "PS256",
          "PS384",
          "PS512",
          "RS256",
          "RS384",
          "RS512",
        ].includes(this.algorithm)
          ? this.modulusLength
          : undefined,
      },
    );
    this.logger.log(`Key generated: ${kid}`);

    // Save public key
    const keyPath = this.keyPath(kid);
    await this.saveKey(publicKey, keyPath);

    // Add new active key to metadata
    this.metadata.keys.push({
      kid,
      status: "active",
      createdAt: now,
      expiresAt: now + this.expirationTime,
      deprecatedAt: null,
      expiredAt: null,
      revokedAt: null,
      removedAt: null,
      keyPath,
    });

    // Save metadata and update JWKS
    this.saveMetadata();
    await this.updateJwks();

    // Replace active private key
    this._privateKey = privateKey;

    this.logger.log("Rotation completed");

    // Clear timeout (if any) and set new timeout for next key rotation
    if (this.rotationTimeout) {
      clearTimeout(this.rotationTimeout);
    }
    this.rotationTimeout = setTimeout(() => {
      void this.rotateKeys();
    }, this.rotationInterval);
    this.logger.log(`Next rotation in ${this.rotationInterval} ms`);
  }

  async revokeKey(kid?: string): Promise<void> {
    const now = Date.now();

    const criterion = kid
      ? (key: Key) => key.kid === kid
      : (key: Key) => key.status === "active";
    const key = this.metadata.keys.find(criterion);

    if (!key) {
      this.logger.warn("Key not found");
      return;
    }

    const wasActive = key.status === "active";
    key.status = "revoked";
    key.revokedAt = now;
    this.logger.log(`Key revoked: ${key.kid}`);

    if (wasActive) {
      await this.rotateKeys();
    } else {
      this.saveMetadata();
      await this.updateJwks();
    }
  }

  async revokeAllKeys(): Promise<void> {
    const now = Date.now();

    this.metadata.keys
      .filter((key) => key.status !== "expired" && key.status !== "revoked")
      .forEach((key) => {
        key.status = "revoked";
        key.revokedAt = now;
        this.logger.log(`Key revoked: ${key.kid}`);
      });

    await this.rotateKeys();
  }

  purgeKeyFiles(): void {
    const now = Date.now();

    this.metadata.keys
      .filter((key) => key.status === "expired" || key.status === "revoked")
      .forEach((key) => {
        if (key.keyPath) {
          this.deleteKey(key.keyPath);
          key.keyPath = null;
          key.removedAt = now;
          this.logger.log(`Key removed: ${key.kid}`);
        }
      });

    this.saveMetadata();
  }

  private async updateJwks(): Promise<void> {
    this.logger.log("Updating JWKS...");

    const keys: jose.JWK[] = [];
    for (const key of this.metadata.keys) {
      if (key.status === "expired" || key.status === "revoked") {
        continue;
      }

      const keyPath = key.keyPath;
      if (!keyPath) {
        this.logger.warn(`Missing public key file path: ${key.kid}`);
        continue;
      }
      if (!fs.existsSync(keyPath)) {
        this.logger.warn(`Missing public key file: ${path.basename(keyPath)}`);
        continue;
      }

      try {
        const publicKey = await this.loadKey(keyPath);
        const jwk = await this.exportJwk(publicKey, key.kid);
        keys.push(jwk);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to load key: ${key.kid}`);
        this.logger.warn(`Error: ${message}`);
      }
    }
    this.jwks.keys = keys;
    this.getKey = jose.createLocalJWKSet(this.jwks);

    this.logger.log(`JWKS: ${keys.length} key(s) loaded`);
  }

  private saveMetadata(): void {
    fs.writeFileSync(this.metadataPath, JSON.stringify(this.metadata));
    this.logger.log("Metadata saved");
  }

  private loadMetadata(): void {
    if (!fs.existsSync(this.metadataPath)) {
      this.logger.log("Metadata not found");
      return;
    }
    this.metadata = metadataSchema.parse(
      JSON.parse(fs.readFileSync(this.metadataPath, "utf8")),
    );
    this.logger.log("Metadata loaded");
  }

  private keyPath(kid: string) {
    return path.join(this.keysDirectory, kid + KEY_EXTENSION);
  }

  private async saveKey(key: jose.CryptoKey, keyPath: string): Promise<void> {
    const keyPem = await jose.exportSPKI(key);
    fs.writeFileSync(keyPath, keyPem);
    this.logger.debug(`Key saved: ${path.basename(keyPath)}`);
  }

  private async loadKey(keyPath: string): Promise<jose.CryptoKey> {
    const keyPEM = fs.readFileSync(keyPath, "utf8");
    const key = await jose.importSPKI(keyPEM, this.algorithm);
    this.logger.debug(`Key loaded: ${path.basename(keyPath)}`);
    return key;
  }

  private deleteKey(keyPath: string): void {
    fs.unlinkSync(keyPath);
    this.logger.debug(`Key deleted: ${path.basename(keyPath)}`);
  }

  private async exportJwk(
    publicKey: jose.CryptoKey,
    kid: string,
  ): Promise<jose.JWK> {
    const jwk = await jose.exportJWK(publicKey);
    jwk.use = "sig";
    jwk.alg = this.algorithm;
    jwk.kid = kid;
    return jwk;
  }
}
