import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { OrdenesModule } from './ordenes/ordenes.module'; // Importado

@Module({
  imports: [DatabaseModule, HealthModule, OrdenesModule], // Añadido aquí
  controllers: [AppController],
})
export class AppModule {}