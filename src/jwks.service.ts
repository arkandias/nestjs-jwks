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
import {
  METADATA_FILE,
  PUBLIC_KEY_EXTENSION,
} from "./constants/filenames.constants";
import { JwksModuleConfig } from "./interfaces";
import { JWKS_MODULE_CONFIG } from "./jwks.module";
import { Metadata, metadataSchema } from "./schemas";

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
  jwks: jose.JSONWebKeySet = { keys: [] };
  private _privateKey: jose.CryptoKey | null = null;
  private _getKey: ReturnType<typeof jose.createLocalJWKSet> | null = null;
  private _jwksKeys: jose.JWK[] | null = null;

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
      this.logger.warn("Keys rotation interval is very short (< 1 minute)");
    }
    if (this.rotationInterval > 2147483647) {
      this.logger.warn(
        "Keys rotation interval exceeds setTimeout limit (2147483647 ms / ~24.8 days)",
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

    // Set interval for key rotation
    this.rotationTimeout = setInterval(() => {
      void this.rotateKeys();
    }, this.rotationInterval);
  }

  onModuleDestroy() {
    if (this.rotationTimeout) {
      clearInterval(this.rotationTimeout);
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

  get getKey() {
    // Only rebuild if JWKS changed
    if (!this._getKey || this.jwks.keys !== this._jwksKeys) {
      this._getKey = jose.createLocalJWKSet(this.jwks);
      this._jwksKeys = this.jwks.keys;
      this.logger.debug("JWKS key function rebuilt");
    }
    return this._getKey;
  }

  private async updateJwks(): Promise<void> {
    this.logger.log("Updating JWKS...");

    const keys: jose.JWK[] = [];
    for (const key of this.metadata.keys) {
      if (key.status === "expired") {
        continue;
      }

      const publicKeyPath = this.publicKeyPath(key.kid);
      if (!fs.existsSync(publicKeyPath)) {
        this.logger.warn(
          `Missing public key file: ${path.basename(publicKeyPath)}`,
        );
        continue;
      }

      const publicKey = await this.loadKey(publicKeyPath);
      const jwk = await this.exportJwk(publicKey, key.kid);
      keys.push(jwk);
    }
    this.jwks.keys = keys;
    this._getKey = jose.createLocalJWKSet(this.jwks);
    this.logger.log(`JWKS: ${keys.length} key(s) loaded`);
  }

  private async rotateKeys(): Promise<void> {
    const now = Date.now();
    this.logger.log("Rotation started...");

    // Purge expired keys
    this.metadata.keys
      .filter((key) => key.status !== "expired" && key.expiresAt <= now)
      .forEach((key) => {
        key.status = "expired";
        key.removedAt = now;
        this.logger.log(`Key expired: ${key.kid}`);
        if (key.publicKeyPath) {
          this.deleteKey(key.publicKeyPath);
          key.publicKeyPath = null;
        }
      });

    // Deprecate any active key in metadata
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
    const publicKeyPath = this.publicKeyPath(kid);
    await this.saveKey(publicKey, publicKeyPath);

    // Add new active key to metadata
    this.metadata.keys.push({
      kid,
      status: "active",
      createdAt: now,
      expiresAt: now + this.expirationTime,
      deprecatedAt: null,
      removedAt: null,
      publicKeyPath,
    });

    // Save metadata
    this.saveMetadata();

    // Update JWKS with metadata
    await this.updateJwks();

    // Replace active private key
    this._privateKey = privateKey;

    this.logger.log("Rotation completed");
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

  private publicKeyPath(kid: string) {
    return path.join(this.keysDirectory, kid + PUBLIC_KEY_EXTENSION);
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
