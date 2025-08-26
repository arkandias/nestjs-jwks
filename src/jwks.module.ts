import { DynamicModule, Global, Module } from "@nestjs/common";

import { JwksModuleAsyncOptions, JwksModuleOptions } from "./interfaces";
import { createJwksController } from "./jwks.controller";
import { JwksService } from "./jwks.service";

export const JWKS_SERVICE_OPTIONS = "JWKS_SERVICE_OPTIONS";

@Global()
@Module({})
export class JwksModule {
  static forRoot(options?: JwksModuleOptions): DynamicModule {
    return {
      module: JwksModule,
      providers: [
        {
          provide: JWKS_SERVICE_OPTIONS,
          useValue: options ?? {},
        },
        JwksService,
      ],
      controllers: [createJwksController(options?.controller)],
      exports: [JwksService],
    };
  }

  static forRootAsync(options: JwksModuleAsyncOptions): DynamicModule {
    return {
      module: JwksModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: JWKS_SERVICE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        JwksService,
      ],
      controllers: [createJwksController(options.controller)],
      exports: [JwksService],
    };
  }
}
