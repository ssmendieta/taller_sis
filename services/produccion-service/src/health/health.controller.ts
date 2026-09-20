import { Controller, Get, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly dataSource?: DataSource) {}

  @Get()
  check() {
    return {
      service: 'produccion-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('database')
  async checkDatabase() {
    if (process.env.SKIP_DB === 'true' || !this.dataSource) {
      return {
        service: 'produccion-service',
        database: 'skipped',
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    }
    try {
      await this.dataSource.query('SELECT 1');
      return {
        service: 'produccion-service',
        database: 'connected',
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        service: 'produccion-service',
        database: 'disconnected',
        status: 'error',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
