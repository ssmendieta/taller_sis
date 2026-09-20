import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      service: 'produccion-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
