import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BoletasService } from './boletas.service';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { BoletaEnvioHistorial } from './entities/boleta-envio-historial.entity';
import { EstadoBoleta } from './entities/estado-boleta.enum';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { SolicitudSalidaItem } from '../solicitudes-salida/entities/solicitud-salida-item.entity';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../database/migrations/1710000000004-HistorialBoletasEnvio';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

/**
 * Saldo documental individual por lote: cada lote tiene su propia cantidad original
 * y solo las boletas EMITIDAS lo consumen. Los borradores no descuentan y las
 * boletas anuladas devuelven su cantidad.
 */
describeConPostgres('saldo documental por lote con PostgreSQL', () => {
  const schema = `abclote_${process.pid}_${Date.now()}`;
  const PRODUCTO_ID = '9';
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
      entities: [
        SolicitudSalida,
        SolicitudSalidaItem,
        BoletaEnvio,
        BoletaEnvioItem,
        BoletaEnvioHistorial,
      ],
      migrations: [
        CrearSolicitudesSalida1710000000001,
        CrearBoletasEnvio1710000000002,
        ReglaConcurrenciaDocumental1710000000003,
        HistorialBoletasEnvio1710000000004,
      ],
      migrationsTableName: 'migrations_abclote',
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
      if (!/^abclote_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  /**
   * Cada escenario usa su propia orden para que los saldos de un caso no
   * afecten a los demás: la orden tiene el lote LOTE-001 con 60 unidades y el
   * lote LOTE-002 con 40 unidades.
   */
  function crearEscenario(ordenId: string) {
    const lotes = [
      { id: `${ordenId}-1`, codigo: 'LOTE-001', ordenId, productoId: PRODUCTO_ID, cantidad: '60.0000' },
      { id: `${ordenId}-2`, codigo: 'LOTE-002', ordenId, productoId: PRODUCTO_ID, cantidad: '40.0000' },
    ];
    const produccion = {
      consultarOrdenPorId: jest.fn().mockResolvedValue({
        id: ordenId, codigo: `ORD-${ordenId}`, producto_id: Number(PRODUCTO_ID), producto: { codigo: 'P-9' },
      }),
      consultarPorOrden: jest.fn().mockResolvedValue(lotes),
      consultarConformesPorOrden: jest.fn().mockResolvedValue([{ cantidad: '100.0000' }]),
    } as any;
    const servicio = new BoletasService(
      dataSource.getRepository(BoletaEnvio),
      dataSource.getRepository(SolicitudSalida),
      dataSource,
      produccion,
    );

    async function crearSolicitud(referencia: string, cantidad: string) {
      const solicitudes = dataSource.getRepository(SolicitudSalida);
      const items = dataSource.getRepository(SolicitudSalidaItem);
      const solicitud = await solicitudes.save(solicitudes.create({
        ordenId,
        destinoDocumental: 'Almacén de despacho',
        motivo: 'Prueba de saldo por lote',
        responsableUsuarioId: '42',
        estado: 'BORRADOR' as const,
      }));
      await items.save(items.create({ solicitudId: solicitud.id, referencia, cantidad }));
      return solicitud;
    }

    async function crearBorrador(solicitudId: string, referencia: string, cantidad: string) {
      const boletas = dataSource.getRepository(BoletaEnvio);
      const items = dataSource.getRepository(BoletaEnvioItem);
      const boleta = await boletas.save(boletas.create({
        solicitudSalidaId: solicitudId,
        responsableUsuarioId: '42',
        estado: EstadoBoleta.BORRADOR,
      }));
      await items.save(items.create({ boletaId: boleta.id, referencia, cantidad }));
      return boleta;
    }

    return { servicio, crearSolicitud, crearBorrador };
  }

  it('un lote de 60 unidades permite emitir una boleta por 20 y otra por 40', async () => {
    const { servicio, crearSolicitud, crearBorrador } = crearEscenario('51');
    const solicitud1 = await crearSolicitud('LOTE-001', '60.0000');
    const solicitud2 = await crearSolicitud('LOTE-001', '60.0000');
    const boleta1 = await crearBorrador(solicitud1.id, 'LOTE-001', '20.0000');
    const boleta2 = await crearBorrador(solicitud2.id, 'LOTE-001', '40.0000');

    await expect(servicio.emitir(boleta1.id, '42', 'Bearer token')).resolves.toMatchObject({
      estado: EstadoBoleta.EMITIDA,
    });
    await expect(servicio.emitir(boleta2.id, '42', 'Bearer token')).resolves.toMatchObject({
      estado: EstadoBoleta.EMITIDA,
    });
  });

  it('después de emitir 20 unidades, otra boleta por 50 del mismo lote se rechaza', async () => {
    const { servicio, crearSolicitud, crearBorrador } = crearEscenario('52');
    const solicitud1 = await crearSolicitud('LOTE-001', '60.0000');
    const solicitud2 = await crearSolicitud('LOTE-001', '60.0000');
    const boleta1 = await crearBorrador(solicitud1.id, 'LOTE-001', '20.0000');
    const boleta2 = await crearBorrador(solicitud2.id, 'LOTE-001', '50.0000');

    await servicio.emitir(boleta1.id, '42', 'Bearer token');

    await expect(servicio.emitir(boleta2.id, '42', 'Bearer token'))
      .rejects.toThrow(new ConflictException('La cantidad del lote LOTE-001 supera el saldo documental disponible del lote'));

    expect((await servicio.findOne(boleta2.id)).estado).toBe(EstadoBoleta.BORRADOR);
  });

  it('los lotes libres de la orden no permiten superar la disponibilidad del lote elegido', async () => {
    const { servicio, crearSolicitud, crearBorrador } = crearEscenario('53');
    const solicitud1 = await crearSolicitud('LOTE-001', '60.0000');
    const solicitud2 = await crearSolicitud('LOTE-001', '60.0000');
    const boleta1 = await crearBorrador(solicitud1.id, 'LOTE-001', '20.0000');
    const boleta2 = await crearBorrador(solicitud2.id, 'LOTE-001', '50.0000');

    await servicio.emitir(boleta1.id, '42', 'Bearer token');

    // El saldo general de la orden (100 - 20 = 80) alcanza, pero el lote no.
    await expect(servicio.emitir(boleta2.id, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(ConflictException);
    expect((await servicio.findOne(boleta2.id)).estado).toBe(EstadoBoleta.BORRADOR);
  });

  it('dos emisiones concurrentes no comprometen más unidades que las disponibles del lote', async () => {
    const { servicio, crearSolicitud, crearBorrador } = crearEscenario('54');
    const solicitud1 = await crearSolicitud('LOTE-001', '40.0000');
    const solicitud2 = await crearSolicitud('LOTE-001', '40.0000');
    const boleta1 = await crearBorrador(solicitud1.id, 'LOTE-001', '40.0000');
    const boleta2 = await crearBorrador(solicitud2.id, 'LOTE-001', '40.0000');

    const resultados = await Promise.allSettled([
      servicio.emitir(boleta1.id, '42', 'Bearer token'),
      servicio.emitir(boleta2.id, '43', 'Bearer token'),
    ]);

    const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
    expect(exitosos).toHaveLength(1);
    const rechazado = resultados.find((resultado) => resultado.status === 'rejected') as PromiseRejectedResult;
    expect(rechazado.reason).toBeInstanceOf(ConflictException);

    const emitidas = await dataSource.getRepository(BoletaEnvio)
      .createQueryBuilder('boleta')
      .innerJoin(BoletaEnvioItem, 'item', 'item.boleta_id = boleta.id')
      .innerJoin('solicitudes_salida', 'solicitud', 'solicitud.id = boleta.solicitud_salida_id')
      .select('COALESCE(SUM(item.cantidad), 0)::text', 'total')
      .where('boleta.estado = :estado', { estado: EstadoBoleta.EMITIDA })
      .andWhere('item.referencia = :referencia', { referencia: 'LOTE-001' })
      .andWhere('solicitud.orden_id = :ordenId', { ordenId: '54' })
      .getRawOne<{ total: string }>();
    expect(Number(emitidas?.total ?? '0')).toBe(40);
  });

  it('una boleta BORRADOR no descuenta unidades del lote', async () => {
    const { servicio, crearSolicitud, crearBorrador } = crearEscenario('55');
    const solicitud1 = await crearSolicitud('LOTE-001', '60.0000');
    const solicitud2 = await crearSolicitud('LOTE-001', '60.0000');
    const borrador = await crearBorrador(solicitud1.id, 'LOTE-001', '60.0000');
    const boleta = await crearBorrador(solicitud2.id, 'LOTE-001', '60.0000');

    // El borrador sigue sin emitirse: no compromete nada del lote.
    await expect(servicio.emitir(boleta.id, '42', 'Bearer token')).resolves.toMatchObject({
      estado: EstadoBoleta.EMITIDA,
    });
    expect((await servicio.findOne(borrador.id)).estado).toBe(EstadoBoleta.BORRADOR);
  });

  it('anular una boleta EMITIDA devuelve su cantidad al lote', async () => {
    const { servicio, crearSolicitud, crearBorrador } = crearEscenario('56');
    const solicitud1 = await crearSolicitud('LOTE-001', '60.0000');
    const solicitud2 = await crearSolicitud('LOTE-001', '60.0000');
    const boleta1 = await crearBorrador(solicitud1.id, 'LOTE-001', '60.0000');
    const boleta2 = await crearBorrador(solicitud2.id, 'LOTE-001', '60.0000');

    await servicio.emitir(boleta1.id, '42', 'Bearer token');
    await servicio.anular(boleta1.id, { motivo: 'Error de despacho' }, '42');

    await expect(servicio.emitir(boleta2.id, '42', 'Bearer token')).resolves.toMatchObject({
      estado: EstadoBoleta.EMITIDA,
    });
  });

  it('una boleta no puede exceder la cantidad autorizada por su solicitud de salida', async () => {
    const { servicio, crearSolicitud, crearBorrador } = crearEscenario('57');
    const solicitud = await crearSolicitud('LOTE-001', '30.0000');
    const boleta = await crearBorrador(solicitud.id, 'LOTE-001', '40.0000');

    await expect(servicio.emitir(boleta.id, '42', 'Bearer token'))
      .rejects.toThrow(new ConflictException('La cantidad del lote LOTE-001 supera la cantidad autorizada en la solicitud de salida'));
    expect((await servicio.findOne(boleta.id)).estado).toBe(EstadoBoleta.BORRADOR);
  });
});
