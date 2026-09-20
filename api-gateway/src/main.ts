import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`api-gateway running on http://localhost:${port}`);
  console.log(`proxy -> auth: ${process.env.AUTH_SERVICE_URL}`);
  console.log(`proxy -> produccion: ${process.env.PRODUCCION_SERVICE_URL}`);
  console.log(`proxy -> logistica: ${process.env.LOGISTICA_SERVICE_URL}`);
}
bootstrap();
