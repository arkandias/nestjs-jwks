import type { JwksModuleConfig } from "../interfaces";

export const RSA_BASED_ALGORITHMS: NonNullable<
  JwksModuleConfig["algorithm"]
>[] = ["PS256", "PS384", "PS512", "RS256", "RS384", "RS512"];
