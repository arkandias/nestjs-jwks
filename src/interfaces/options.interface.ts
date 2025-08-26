import type { ModuleMetadata } from "@nestjs/common";

import type { Algorithm } from "../types";

export interface JwksServiceOptions {
  algorithm?: Algorithm;
  modulusLength?: number;
  rotationInterval?: number;
  expirationTime?: number;
  keysDirectory?: string;
}

export interface JwksControllerOptions {
  path?: string;
  endpoint?: string;
  headers?: Record<string, string>;
}

export interface JwksModuleOptions extends JwksServiceOptions {
  controller?: JwksControllerOptions;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface JwksModuleAsyncOptions
  extends Pick<ModuleMetadata, "imports"> {
  useFactory: (
    ...args: any[]
  ) => JwksServiceOptions | Promise<JwksServiceOptions>;
  inject?: any[];

  // Synchronous controller options
  controller?: JwksControllerOptions;
}
