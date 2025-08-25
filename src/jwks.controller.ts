import { Controller, Get, Header, Res } from "@nestjs/common";
import type { Response } from "express";

import {
  CONTROLLER_DEFAULT_ENDPOINT,
  CONTROLLER_DEFAULT_HEADERS,
  CONTROLLER_DEFAULT_PATH,
} from "./constants/defaults.constants";
import { JwksControllerConfig } from "./interfaces/config.interface";
import { JwksService } from "./jwks.service";

export function createJwksController(config?: JwksControllerConfig) {
  const path = config?.path ?? CONTROLLER_DEFAULT_PATH;
  const endpoint = config?.endpoint ?? CONTROLLER_DEFAULT_ENDPOINT;
  const headers = { ...CONTROLLER_DEFAULT_HEADERS, ...config?.headers };

  @Controller(path)
  class JwksController {
    constructor(readonly jwksService: JwksService) {}

    @Get(endpoint)
    @Header("Content-Type", "application/json")
    getPublicKeyJwks(@Res() res: Response) {
      // Apply custom headers
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      return res.json(this.jwksService.jwks);
    }
  }

  return JwksController;
}
