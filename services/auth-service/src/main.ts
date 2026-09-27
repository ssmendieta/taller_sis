import * as dotenv from 'dotenv';
import * as path from 'path';
// B1: carga temprana .env antes de AppModule (que importa DatabaseModule)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { AppModule } from './app.module';

import {DataSource} from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Serializa respuestas con class-transformer: respeta @Exclude() (ej. password_hash)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const db=app.get(DataSource);
  console.log('db conectada: ', db.isInitialized);
  console.log('tablas orm: ', db.entityMetadatas.map((meta) => meta.tableName));
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`auth-service running on http://localhost:${port}`);
}
bootstrap();
