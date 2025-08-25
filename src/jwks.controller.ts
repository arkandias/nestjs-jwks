import { Controller, Get, Header } from "@nestjs/common";

import { JwksService } from "./jwks.service";

@Controller(".well-known")
export class JwksController {
  constructor(private readonly keysService: JwksService) {}

  @Get("jwks.json")
  @Header("Content-Type", "application/json")
  getPublicKeyJwks() {
    return this.keysService.jwks;
  }
}
