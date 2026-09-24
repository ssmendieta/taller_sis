import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AvancesProduccionModule } from './avances_produccion/avances_produccion.module';
import { OrdenesProduccionModule } from './ordenes_produccion/ordenes_produccion.module';

@Module({
  imports: [DatabaseModule, HealthModule, AvancesProduccionModule, OrdenesProduccionModule],
  controllers: [AppController],
})
export class AppModule {}
