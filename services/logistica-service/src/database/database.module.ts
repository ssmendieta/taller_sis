import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const dbEnabled = process.env.SKIP_DB !== 'true';

@Module({
  imports: dbEnabled
    ? [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
          username: process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres',
          password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
          database:
            process.env.DB_DATABASE ||
            process.env.DB_LOGISTICA_DATABASE ||
            process.env.POSTGRES_DB ||
            process.env.LOGISTICA_DB ||
            'logistica_db',
          autoLoadEntities: true,
          synchronize: false,
          logging: false,
        }),
      ]
    : [],
})
export class DatabaseModule {}
