export const DEFAULT_ALGORITHM = "EdDSA";
export const DEFAULT_MODULUS_LENGTH = 2048;
export const DEFAULT_ROTATION_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7d
export const DEFAULT_EXPIRATION_TIME = 28 * 24 * 60 * 60 * 1000; // 28d
export const DEFAULT_KEYS_DIRECTORY = "./keys";

export const CONTROLLER_DEFAULT_PATH = ".well-known";
export const CONTROLLER_DEFAULT_ENDPOINT = "jwks.json";
export const CONTROLLER_DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};
