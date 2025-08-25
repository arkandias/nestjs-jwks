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
  modulusLength?: number;
  rotationInterval?: number;
  expirationTime?: number;
  keysDirectory?: string;

  // Controller configuration
  controller?: JwksControllerConfig;
}

export interface JwksControllerConfig {
  path?: string;
  endpoint?: string;
  headers?: Record<string, string>;
}
