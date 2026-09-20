import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return { message: 'api-gateway running', health: '/health', note: 'Routing Fase 2' };
  }
}
