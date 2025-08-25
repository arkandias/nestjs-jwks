export interface JwksModuleConfig {
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
  modulusLength?: number; // for RSA-based algorithms only
  rotationInterval?: number; // in milliseconds
  expirationTime?: number; // in milliseconds
  keysDirectory?: string;
}
