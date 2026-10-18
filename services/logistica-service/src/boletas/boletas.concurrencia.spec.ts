import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BoletasService } from './boletas.service';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { EstadoBoleta } from './entities/estado-boleta.enum';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { SolicitudSalidaItem } from '../solicitudes-salida/entities/solicitud-salida-item.entity';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

describeConPostgres('ABC-224: concurrencia documental con PostgreSQL', () => {
  const schema = `abc224_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;

  beforeAll(async () => {
    const connection = {
      type: 'postgres' as const,
      host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
      username: process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.DB_LOGISTICA_DATABASE || process.env.LOGISTICA_DB || 'logistica_db',
    };
    admin = new DataSource(connection);
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      ...connection,
      schema,
      entities: [SolicitudSalida, SolicitudSalidaItem, BoletaEnvio, BoletaEnvioItem],
      migrations: [
        CrearSolicitudesSalida1710000000001,
        CrearBoletasEnvio1710000000002,
        ReglaConcurrenciaDocumental1710000000003,
      ],
      migrationsTableName: 'migrations_abc224',
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
      if (!/^abc224_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('dos emisores no comprometen más cantidad que la conforme', async () => {
    const solicitudes = dataSource.getRepository(SolicitudSalida);
    const boletas = dataSource.getRepository(BoletaEnvio);
    const solicitudItems = dataSource.getRepository(SolicitudSalidaItem);
    const boletaItems = dataSource.getRepository(BoletaEnvioItem);
    const solicitudBase = {
      ordenId: '8',
      destinoDocumental: 'Almacén de despacho',
      motivo: 'Prueba ABC-224',
      responsableUsuarioId: '42',
      estado: 'BORRADOR' as const,
    };
    const solicitud1 = await solicitudes.save(solicitudes.create(solicitudBase));
    const solicitud2 = await solicitudes.save(solicitudes.create(solicitudBase));
    await solicitudItems.save([
      solicitudItems.create({ solicitudId: solicitud1.id, referencia: 'L-1', cantidad: '6.0000' }),
      solicitudItems.create({ solicitudId: solicitud2.id, referencia: 'L-1', cantidad: '6.0000' }),
    ]);
    const boleta1 = await boletas.save(boletas.create({
      solicitudSalidaId: solicitud1.id, responsableUsuarioId: '42', estado: EstadoBoleta.BORRADOR,
    }));
    const boleta2 = await boletas.save(boletas.create({
      solicitudSalidaId: solicitud2.id, responsableUsuarioId: '43', estado: EstadoBoleta.BORRADOR,
    }));
    await boletaItems.save([
      boletaItems.create({ boletaId: boleta1.id, referencia: 'L-1', cantidad: '6.0000' }),
      boletaItems.create({ boletaId: boleta2.id, referencia: 'L-1', cantidad: '6.0000' }),
    ]);
    const produccion = {
      consultarOrdenPorId: jest.fn().mockResolvedValue({
        id: '8', codigo: 'ORD-7', producto_id: 3, producto: { codigo: 'P-3' },
      }),
      consultarConformesPorOrden: jest.fn().mockResolvedValue([{ cantidad: '10.0000' }]),
    } as any;
    const service = new BoletasService(boletas, solicitudes, dataSource, produccion);

    const resultados = await Promise.allSettled([
      service.emitir(boleta1.id, '42', 'Bearer autorizado-1'),
      service.emitir(boleta2.id, '43', 'Bearer autorizado-2'),
    ]);

    const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
    if (exitosos.length === 0) {
      const causas = resultados.map((resultado) =>
        resultado.status === 'rejected' ? String(resultado.reason?.stack ?? resultado.reason) : 'ok',
      ).join('\n');
      throw new Error(`Ambas emisiones fueron rechazadas:\n${causas}`);
    }
    expect(exitosos).toHaveLength(1);
    const rechazado = resultados.find((resultado) => resultado.status === 'rejected') as PromiseRejectedResult;
    expect(rechazado.reason).toBeInstanceOf(ConflictException);
    const persistidas = await Promise.all([
      service.findOne(boleta1.id),
      service.findOne(boleta2.id),
    ]);
    expect(persistidas.filter((boleta) => boleta.estado === EstadoBoleta.EMITIDA)).toHaveLength(1);
    expect(persistidas.filter((boleta) => boleta.estado === EstadoBoleta.BORRADOR)).toHaveLength(1);

    const emitida = persistidas.find((boleta) => boleta.estado === EstadoBoleta.EMITIDA)!;
    await expect(service.emitir(emitida.id, '42', 'Bearer autorizado-1'))
      .resolves.toMatchObject({ id: emitida.id, estado: EstadoBoleta.EMITIDA });
    const despuesDelReintento = await Promise.all([
      service.findOne(boleta1.id),
      service.findOne(boleta2.id),
    ]);
    expect(despuesDelReintento.filter((boleta) => boleta.estado === EstadoBoleta.EMITIDA)).toHaveLength(1);
  });

  it('permite dos emisiones concurrentes que completan exactamente el saldo', async () => {
    const solicitudes = dataSource.getRepository(SolicitudSalida);
    const boletas = dataSource.getRepository(BoletaEnvio);
    const boletaItems = dataSource.getRepository(BoletaEnvioItem);
    const solicitudBase = {
      ordenId: '9', destinoDocumental: 'Almacén de despacho', motivo: 'Límite ABC-224',
      responsableUsuarioId: '42', estado: 'BORRADOR' as const,
    };
    const solicitud1 = await solicitudes.save(solicitudes.create(solicitudBase));
    const solicitud2 = await solicitudes.save(solicitudes.create(solicitudBase));
    const boleta1 = await boletas.save(boletas.create({
      solicitudSalidaId: solicitud1.id, responsableUsuarioId: '42', estado: EstadoBoleta.BORRADOR,
    }));
    const boleta2 = await boletas.save(boletas.create({
      solicitudSalidaId: solicitud2.id, responsableUsuarioId: '43', estado: EstadoBoleta.BORRADOR,
    }));
    await boletaItems.save([
      boletaItems.create({ boletaId: boleta1.id, referencia: 'L-2', cantidad: '5.0000' }),
      boletaItems.create({ boletaId: boleta2.id, referencia: 'L-2', cantidad: '5.0000' }),
    ]);
    const produccion = {
      consultarOrdenPorId: jest.fn().mockResolvedValue({
        id: '9', codigo: 'ORD-9', producto_id: 4, producto: { codigo: 'P-4' },
      }),
      consultarConformesPorOrden: jest.fn().mockResolvedValue([{ cantidad: '10.0000' }]),
    } as any;
    const service = new BoletasService(boletas, solicitudes, dataSource, produccion);

    const resultados = await Promise.allSettled([
      service.emitir(boleta1.id, '42', 'Bearer autorizado-1'),
      service.emitir(boleta2.id, '43', 'Bearer autorizado-2'),
    ]);

    expect(resultados.every((resultado) => resultado.status === 'fulfilled')).toBe(true);
    const persistidas = await Promise.all([service.findOne(boleta1.id), service.findOne(boleta2.id)]);
    expect(persistidas.every((boleta) => boleta.estado === EstadoBoleta.EMITIDA)).toBe(true);
  });
});
