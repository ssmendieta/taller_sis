import 'reflect-metadata';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || process.env.DB_LOGISTICA_DATABASE || 'logistica_db',
  synchronize: false,
  logging: false,
  entities: [],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});

export default AppDataSource;
