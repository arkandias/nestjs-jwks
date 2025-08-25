import { DynamicModule, Module } from "@nestjs/common";

import { JwksModuleConfig } from "./interfaces";
import { JwksController } from "./jwks.controller";
import { JwksService } from "./jwks.service";

export const JWKS_MODULE_CONFIG = "JWKS_MODULE_CONFIG";

@Module({})
export class JwksModule {
  static forRoot(config: JwksModuleConfig): DynamicModule {
    return {
      module: JwksModule,
      providers: [
        {
          provide: JWKS_MODULE_CONFIG,
          useValue: config,
        },
        JwksService,
      ],
      controllers: [JwksController],
      exports: [JwksService],
    };
  }
}
