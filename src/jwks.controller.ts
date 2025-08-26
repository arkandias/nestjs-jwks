import { Controller, Get, Header, Res } from "@nestjs/common";
import type { Response } from "express";

import {
  CONTROLLER_DEFAULT_ENDPOINT,
  CONTROLLER_DEFAULT_HEADERS,
  CONTROLLER_DEFAULT_PATH,
} from "./constants";
import { JwksControllerOptions } from "./interfaces";
import { JwksService } from "./jwks.service";

export function createJwksController(options?: JwksControllerOptions) {
  const path = options?.path ?? CONTROLLER_DEFAULT_PATH;
  const endpoint = options?.endpoint ?? CONTROLLER_DEFAULT_ENDPOINT;
  const headers = { ...CONTROLLER_DEFAULT_HEADERS, ...options?.headers };

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
