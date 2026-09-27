import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || process.env.DB_AUTH_DATABASE || process.env.POSTGRES_DB || process.env.AUTH_DB || 'auth_db',
  synchronize: false,
  logging: false,
  entities: [],
  migrations: [path.join(__dirname, 'migrations/*{.ts,.js}')],
});
