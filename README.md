# nestjs-jwks

JWT key management with automatic rotation and JWKS endpoint for NestJS applications.
Built with the JOSE library for robust cryptographic operations.

[![npm version](https://img.shields.io/npm/v/nestjs-jwks.svg)](https://www.npmjs.com/package/nestjs-jwks)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔄 **Automatic Key Rotation**: Keys are automatically rotated at configurable intervals
- 🔐 **Multiple Algorithms**: Supports RSA, ECDSA, and EdDSA algorithms
- 🔗 **JWKS Endpoint**: Provides a standard JWKS endpoint for public key discovery (RFC 7517)
- 📁 **Persistent Storage**: Public keys are stored securely on the filesystem
- 🛡️ **Secure by Default**: Private keys are non-extractable and kept in memory only
- ⚙️ **Simple Configuration**: Easy to customize rotation intervals, expiration times, endpoints, etc.
- 🔧 **JOSE Integration**: Built on the industry-standard JOSE library for reliable JWT operations

## Installation

```bash
npm install nestjs-jwks
# or
yarn add nestjs-jwks
# or
pnpm add nestjs-jwks
```

## Quick Start

### 1. Import the Module

```typescript
import { Module } from "@nestjs/common";
import { JwksModule } from "nestjs-jwks";

@Module({
  imports: [
    JwksModule.forRoot({
      algorithm: "EdDSA",
      rotationInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
      expirationTime: 28 * 24 * 60 * 60 * 1000, // 28 days
    }),
  ],
})
export class AppModule {}
```

**⚠️ Important: This module is global by design.**
Import `JwksModule.forRoot()` or `JwksModule.forRootAsync()` only once in your root module (typically `AppModule`).
The `JwksService` will then be available for injection throughout your entire application without needing to import the
module in other feature modules.

**💡 Note:** For dynamic configuration (e.g., using `ConfigService`), use `JwksModule.forRootAsync()`.
Note that only **service configuration** can be resolved asynchronously &ndash; **controller configuration**
must always be provided synchronously as NestJS requires route information at module initialization.
See the [Configuration](#configuration) section below for async configuration examples.

### 2. Use the Service with JOSE

```typescript
import * as jose from "jose";
import { Injectable } from "@nestjs/common";
import { JwksService } from "nestjs-jwks";

@Injectable()
export class AuthService {
  constructor(private readonly jwksService: JwksService) {}

  async signToken(payload: any): Promise<string> {
    // Use JOSE library with the managed keys
    return await new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: this.jwksService.alg,
        kid: this.jwksService.kid,
      })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(this.jwksService.privateKey);
  }

  async verifyToken(token: string): Promise<any> {
    // JOSE library handles key resolution automatically
    const { payload } = await jose.jwtVerify(token, this.jwksService.getKey);
    return payload;
  }
}
```

### 3. Access JWKS Endpoint

The module automatically creates a JWKS endpoint at:

```
GET /.well-known/jwks.json
```

## Configuration

### Options Interfaces

The module options are split into two parts: **service options** (which can be resolved asynchronously) and **controller
options** (which must be provided synchronously).
For sync registration, both are combined in `JwksModuleOptions`, while for async registration, `JwksModuleAsyncOptions`
resolves service options through a factory while keeping controller options direct.
This separation enables dynamic service options while keeping routing paths static as required by NestJS.

#### Service Options

Service options control the cryptographic behavior and key management.
These options can be resolved asynchronously when using `forRootAsync()`.

```typescript
interface JwksServiceOptions {
  algorithm?:
    | "Ed25519"
    | "EdDSA"
    | "ES256"
    | "ES384"
    | "ES512"
    | "PS256"
    | "PS384"
    | "PS512"
    | "RS256"
    | "RS384"
    | "RS512";
  modulusLength?: number;
  rotationInterval?: number;
  expirationTime?: number;
  keysDirectory?: string;
}
```

#### Controller Options

Controller options define the HTTP endpoint configuration.
These options must always be provided synchronously, as NestJS requires route paths to be known at module initialization
time.

```typescript
interface JwksControllerOptions {
  path?: string;
  endpoint?: string;
  headers?: Record<string, string>;
}
```

#### Module Options

`JwksModuleOptions` combines both service and controller options for synchronous registration with `forRoot()`.
`JwksModuleAsyncOptions` separates them, allowing service options to be resolved through a factory while controller options remain direct.

```typescript
interface JwksModuleOptions extends JwksServiceOptions {
  controller?: JwksControllerOptions;
}
```

```typescript
interface JwksModuleAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  useFactory: (
    ...args: any[]
  ) => JwksServiceOptions | Promise<JwksServiceOptions>; // Factory returns only service options
  inject?: any[]; // Dependencies to inject into factory
  controller?: JwksControllerOptions; // Provided directly (synchronously)
}
```

### Configuration Reference

| Option                | Default Value                            | Description                                                              |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `algorithm`           | `'EdDSA'`                                | Cryptographic algorithm                                                  |
| `modulusLength`       | `2048`                                   | RSA key length in bits (RSA algorithms only)                             |
| `rotationInterval`    | `604800000` (7d)                         | Interval between automatic key rotations (in milliseconds)               |
| `expirationTime`      | `2419200000` (28d)                       | Time until keys are removed from JWKS (in milliseconds)                  |
| `keysDirectory`       | `'./keys'`                               | Directory to store keys (relative to `process.cwd()`)                    |
| `controller.path`     | `'.well-known'`                          | Controller base path                                                     |
| `controller.endpoint` | `'jwks.json'`                            | JWKS endpoint                                                            |
| `controller.headers`  | `{ "Content-Type": "application/json" }` | HTTP headers for JWKS response (custom headers are merged with defaults) |

### Usage Examples

Here are two common ways to configure the JWKS module in your NestJS application.
In both examples, the module creates a JWKS endpoint at: `GET /auth/keys`

#### Synchronous Configuration

```typescript
JwksModule.forRoot({
  algorithm: "RS256",
  modulusLength: 4096,
  rotationInterval: 24 * 60 * 60 * 1000, // 1 day
  expirationTime: 7 * 24 * 60 * 60 * 1000, // 7 days
  keysDirectory: "./secure-keys",
  controller: {
    path: "auth",
    endpoint: "keys",
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  },
});
```

#### Asynchronous Configuration

```typescript
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    ConfigModule.forRoot(),
    JwksModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // 🔄 ASYNC: Service options loaded from environment variables via ConfigService
        algorithm: configService.get("JWKS_ALGORITHM"),
        modulusLength: configService.get<number>("JWKS_MODULUS_LENGTH"),
        rotationInterval: configService.get<number>("JWKS_ROTATION_INTERVAL"),
        expirationTime: configService.get<number>("JWKS_EXPIRATION_TIME"),
        keysDirectory: configService.get("JWKS_KEYS_DIRECTORY"),
      }),
      // ⚡ SYNC: Controller options provided directly (or using process.env directly)
      controller: {
        path: "auth",
        endpoint: "keys",
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      },
    }),
  ],
})
export class AppModule {}
```

## Supported Algorithms

### EdDSA (Recommended)

- `EdDSA` / `Ed25519` &ndash; Edwards-curve Digital Signature Algorithm

### ECDSA

- `ES256` &ndash; ECDSA using P-256 and SHA-256
- `ES384` &ndash; ECDSA using P-384 and SHA-384
- `ES512` &ndash; ECDSA using P-521 and SHA-512

### RSA

- `RS256` &ndash; RSASSA-PKCS1-v1_5 using SHA-256
- `RS384` &ndash; RSASSA-PKCS1-v1_5 using SHA-384
- `RS512` &ndash; RSASSA-PKCS1-v1_5 using SHA-512
- `PS256` &ndash; RSASSA-PSS using SHA-256
- `PS384` &ndash; RSASSA-PSS using SHA-384
- `PS512` &ndash; RSASSA-PSS using SHA-512

**Note:** RSA algorithms use the `modulusLength` option.
The key length must be at least 2048 bits.

## Key Management

The module automatically manages cryptographic keys through a complete lifecycle with persistent storage to ensure continuity across server restarts.

### Key States

1. **Active**: The current key used for signing new tokens
2. **Deprecated**: Previous keys still valid for token verification
3. **Expired**: Keys that are no longer valid and removed from JWKS

### Key Storage

- Public keys are stored as PEM files on disk
- Private keys are non-extractable: they cannot be exported from memory, ensuring maximum security
- On startup, key rotation is triggered to generate a fresh active private key
- Non-expired public keys remain available for token verification after restarts
- The complete lifecycle of keys is stored in `metadata.json`

### Timeline Example

| Day | Key A      | Key B      | Key C      | Key D      | Key E      |
| --- | ---------- | ---------- | ---------- | ---------- | ---------- |
| 0   | Active     |            |            |            |            |
| 7   | Deprecated | Active     |            |            |            |
| 14  | Deprecated | Deprecated | Active     |            |            |
| 21  | Deprecated | Deprecated | Deprecated | Active     |            |
| 28  | Expired    | Deprecated | Deprecated | Deprecated | Active     |
| 35  | Expired    | Expired    | Deprecated | Deprecated | Deprecated |
| 42  | Expired    | Expired    | Expired    | Deprecated | Deprecated |

#### Legend

- **Active**: Current signing key
- **Deprecated**: Available for verification only
- **Expired**: Removed from JWKS

### Keys Directory Structure

```
keys/
├── metadata.json   # Keys metadata and lifecycle info
├── <uuid-1>.pem    # Public key file
├── <uuid-2>.pem    # Public key file
└── ...
```

## API Reference

### JwksService

#### Properties

- `alg: string` &ndash; Algorithm used
- `kid: string` &ndash; Current active key ID
- `privateKey: jose.CryptoKey` &ndash; Current private key for signing
- `jwks: jose.JSONWebKeySet` &ndash; The public JWKS object
- `getKey: Function` &ndash; Key resolver function for verification

#### Methods

- `rotateKeys(): Promise<void>` &ndash; Manually trigger key rotation (generates new active key and deprecates current one)
- `revokeKey(kid?: string): Promise<void>` &ndash; Revoke a specific key or current active key (triggers rotation if active key is revoked)
- `revokeAllKeys(): Promise<void>` &ndash; Revoke all non-expired keys (triggers rotation)
- `purgeKeyFiles(): void` &ndash; Delete key files for expired/revoked keys (keeps metadata for audit)

The service automatically manages key rotation on startup and at configured intervals.
Manual operations are available for security incidents or administrative needs.

## Contributing

Contributions are welcome! Please feel free to submit Issues and Pull Requests.

## License

This project is licensed under the MIT License &ndash; see the [LICENSE](LICENSE) file for details.

---

## Related

- [NestJS](https://nestjs.com/) &ndash; A progressive Node.js framework
- [JOSE](https://github.com/panva/jose) &ndash; JavaScript implementation of JSON Web Signature and Encryption
- [RFC 7517](https://tools.ietf.org/html/rfc7517) &ndash; JSON Web Key (JWK) specification
