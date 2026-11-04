import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BoletasService } from './boletas.service';
import { EstadoBoleta } from './entities/estado-boleta.enum';
import { esTransicionBoletaValida, TRANSICIONES_BOLETA_PERMITIDAS } from './entities/estado-boleta.transiciones';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { BoletaEnvioHistorial } from './entities/boleta-envio-historial.entity';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { SolicitudSalidaItem } from '../solicitudes-salida/entities/solicitud-salida-item.entity';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../database/migrations/1710000000004-HistorialBoletasEnvio';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

describe('ABC-245: Reglas de transición de estado de boletas', () => {
  it('permite la emisión desde BORRADOR (BORRADOR -> EMITIDA)', () => {
    expect(esTransicionBoletaValida(EstadoBoleta.BORRADOR, EstadoBoleta.EMITIDA)).toBe(true);
  });

  it('permite la anulación desde EMITIDA (EMITIDA -> ANULADA)', () => {
    expect(esTransicionBoletaValida(EstadoBoleta.EMITIDA, EstadoBoleta.ANULADA)).toBe(true);
  });

  it('rechaza anular directamente una boleta en BORRADOR (BORRADOR -> ANULADA)', () => {
    expect(esTransicionBoletaValida(EstadoBoleta.BORRADOR, EstadoBoleta.ANULADA)).toBe(false);
  });

  it('rechaza emitir una boleta ya ANULADA (ANULADA -> EMITIDA)', () => {
    expect(esTransicionBoletaValida(EstadoBoleta.ANULADA, EstadoBoleta.EMITIDA)).toBe(false);
  });

  it('rechaza regresar una boleta ANULADA a BORRADOR (ANULADA -> BORRADOR)', () => {
    expect(esTransicionBoletaValida(EstadoBoleta.ANULADA, EstadoBoleta.BORRADOR)).toBe(false);
  });

  it('rechaza regresar una boleta EMITIDA a BORRADOR (EMITIDA -> BORRADOR)', () => {
    expect(esTransicionBoletaValida(EstadoBoleta.EMITIDA, EstadoBoleta.BORRADOR)).toBe(false);
  });

  it('rechaza transiciones hacia el mismo estado', () => {
    expect(esTransicionBoletaValida(EstadoBoleta.BORRADOR, EstadoBoleta.BORRADOR)).toBe(false);
    expect(esTransicionBoletaValida(EstadoBoleta.EMITIDA, EstadoBoleta.EMITIDA)).toBe(false);
    expect(esTransicionBoletaValida(EstadoBoleta.ANULADA, EstadoBoleta.ANULADA)).toBe(false);
  });

  it('define formalmente el mapa inmutable de transiciones permitidas', () => {
    expect(TRANSICIONES_BOLETA_PERMITIDAS).toEqual({
      [EstadoBoleta.BORRADOR]: [EstadoBoleta.EMITIDA],
      [EstadoBoleta.EMITIDA]: [EstadoBoleta.ANULADA],
      [EstadoBoleta.ANULADA]: [],
    });
  });
});

describe('ABC-245: Modelo y entidad de auditoría (BoletaEnvioHistorial)', () => {
  it('instancia correctamente un registro de historial con todos sus campos', () => {
    const ahora = new Date();
    const historial = new BoletaEnvioHistorial();
    historial.id = '1';
    historial.boletaId = '100';
    historial.estadoAnterior = EstadoBoleta.EMITIDA;
    historial.estadoNuevo = EstadoBoleta.ANULADA;
    historial.usuarioActorId = '42';
    historial.motivo = 'Error en el destino de despacho detectado a tiempo';
    historial.fechaHora = ahora;

    expect(historial.id).toBe('1');
    expect(historial.boletaId).toBe('100');
    expect(historial.estadoAnterior).toBe(EstadoBoleta.EMITIDA);
    expect(historial.estadoNuevo).toBe(EstadoBoleta.ANULADA);
    expect(historial.usuarioActorId).toBe('42');
    expect(historial.motivo).toBe('Error en el destino de despacho detectado a tiempo');
    expect(historial.fechaHora).toBe(ahora);
    expect(historial.creadoEn).toBe(ahora);
    expect(historial.usuarioId).toBe('42');
  });

  it('preserva el documento original sin mutar datos de la boleta de envío', () => {
    const boleta = new BoletaEnvio();
    boleta.id = '100';
    boleta.numero = 'BOL-2026-0001';
    boleta.estado = EstadoBoleta.EMITIDA;
    boleta.solicitudSalidaId = '50';
    boleta.responsableUsuarioId = '15';
    boleta.historial = [];

    // Crear evento de auditoría
    const entradaHistorial = new BoletaEnvioHistorial();
    entradaHistorial.id = '1';
    entradaHistorial.boletaId = boleta.id;
    entradaHistorial.boleta = boleta;
    entradaHistorial.estadoAnterior = EstadoBoleta.EMITIDA;
    entradaHistorial.estadoNuevo = EstadoBoleta.ANULADA;
    entradaHistorial.usuarioActorId = '99';
    entradaHistorial.motivo = 'Cliente canceló el pedido antes de la entrega';
    entradaHistorial.fechaHora = new Date('2026-03-02T12:00:00Z');

    boleta.historial.push(entradaHistorial);

    // Verificamos que la información original del documento boleta no se mutó
    expect(boleta.id).toBe('100');
    expect(boleta.numero).toBe('BOL-2026-0001');
    expect(boleta.responsableUsuarioId).toBe('15');
    expect(boleta.solicitudSalidaId).toBe('50');
    expect(boleta.historial).toHaveLength(1);
    expect(boleta.historial[0].usuarioActorId).toBe('99');
    expect(boleta.historial[0].estadoAnterior).toBe(EstadoBoleta.EMITIDA);
    expect(boleta.historial[0].estadoNuevo).toBe(EstadoBoleta.ANULADA);
  });
});

const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

describeConPostgres('ABC-245: Persistencia de auditoría y restricciones en PostgreSQL', () => {
  const schema = `abc245_${process.pid}_${Date.now()}`;
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
      migrationsTableName: 'migrations_abc245',
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
      if (!/^abc245_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  async function crearSolicitudYBoleta(estado: EstadoBoleta = EstadoBoleta.EMITIDA): Promise<{ solicitudId: string; boletaId: string; ordenId: string }> {
    const solRepo = dataSource.getRepository(SolicitudSalida);
    const boletaRepo = dataSource.getRepository(BoletaEnvio);
    const itemRepo = dataSource.getRepository(BoletaEnvioItem);

    const ordenId = String(Date.now().toString().slice(-6));
    const solicitud = await solRepo.save(
      solRepo.create({
        ordenId,
        destinoDocumental: 'Almacén central',
        motivo: 'Traslado de auditoría',
        responsableUsuarioId: '10',
        estado: 'BORRADOR',
      }),
    );

    const boleta = await boletaRepo.save(
      boletaRepo.create({
        solicitudSalidaId: solicitud.id,
        estado,
        numero: `B${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`,
        responsableUsuarioId: '10',
      }),
    );

    await itemRepo.save(
      itemRepo.create({
        boletaId: boleta.id,
        referencia: 'LOT-PRUEBA',
        cantidad: '10.0000',
      }),
    );

    return { solicitudId: solicitud.id, boletaId: boleta.id, ordenId };
  }

  it('persiste un evento de auditoría y permite consultarlo vinculado a la boleta', async () => {
    const { boletaId } = await crearSolicitudYBoleta();
    const historialRepo = dataSource.getRepository(BoletaEnvioHistorial);
    const boletaRepo = dataSource.getRepository(BoletaEnvio);

    const evento = await historialRepo.save(
      historialRepo.create({
        boletaId,
        estadoAnterior: EstadoBoleta.EMITIDA,
        estadoNuevo: EstadoBoleta.ANULADA,
        usuarioActorId: '99',
        motivo: 'Dirección de destino incorrecta registrada en la orden',
      }),
    );

    expect(evento.id).toBeDefined();
    expect(evento.fechaHora).toBeInstanceOf(Date);

    // Consulta la boleta cargando su historial
    const boletaConHistorial = await boletaRepo.findOne({
      where: { id: boletaId },
      relations: { historial: true },
    });

    expect(boletaConHistorial).not.toBeNull();
    expect(boletaConHistorial!.historial).toHaveLength(1);
    expect(boletaConHistorial!.historial[0].motivo).toBe('Dirección de destino incorrecta registrada en la orden');
    expect(boletaConHistorial!.historial[0].usuarioActorId).toBe('99');
  });

  it('rechaza eliminar una boleta que tiene registros de auditoría (ON DELETE RESTRICT)', async () => {
    const { boletaId } = await crearSolicitudYBoleta();
    const historialRepo = dataSource.getRepository(BoletaEnvioHistorial);
    const boletaRepo = dataSource.getRepository(BoletaEnvio);

    await historialRepo.save(
      historialRepo.create({
        boletaId,
        estadoAnterior: EstadoBoleta.EMITIDA,
        estadoNuevo: EstadoBoleta.ANULADA,
        usuarioActorId: '88',
        motivo: 'Auditoría requerida para conservación documental',
      }),
    );

    // Intentar borrar la boleta debe fallar por FK RESTRICT
    await expect(boletaRepo.delete({ id: boletaId })).rejects.toThrow();
  });

  it('rechaza en base de datos la inserción de un motivo vacío o compuesto por espacios', async () => {
    const { boletaId } = await crearSolicitudYBoleta();
    const historialRepo = dataSource.getRepository(BoletaEnvioHistorial);

    // Motivo con espacios en blanco
    await expect(
      historialRepo.save(
        historialRepo.create({
          boletaId,
          estadoAnterior: EstadoBoleta.EMITIDA,
          estadoNuevo: EstadoBoleta.ANULADA,
          usuarioActorId: '1',
          motivo: '     ',
        }),
      ),
    ).rejects.toThrow();

    // Motivo de longitud 0
    await expect(
      historialRepo.save(
        historialRepo.create({
          boletaId,
          estadoAnterior: EstadoBoleta.EMITIDA,
          estadoNuevo: EstadoBoleta.ANULADA,
          usuarioActorId: '1',
          motivo: '',
        }),
      ),
    ).rejects.toThrow();
  });

  it('rechaza en base de datos un actor con identificador menor o igual a 0', async () => {
    const { boletaId } = await crearSolicitudYBoleta();
    const historialRepo = dataSource.getRepository(BoletaEnvioHistorial);

    await expect(
      historialRepo.save(
        historialRepo.create({
          boletaId,
          estadoAnterior: EstadoBoleta.EMITIDA,
          estadoNuevo: EstadoBoleta.ANULADA,
          usuarioActorId: '0',
          motivo: 'Motivo con actor inválido',
        }),
      ),
    ).rejects.toThrow();
  });

  it('ABC-246: anula a través de BoletasService persistiendo estado ANULADA y registro de auditoría en PostgreSQL', async () => {
    const { boletaId } = await crearSolicitudYBoleta(EstadoBoleta.EMITIDA);
    const boletaRepo = dataSource.getRepository(BoletaEnvio);
    const solRepo = dataSource.getRepository(SolicitudSalida);
    const historialRepo = dataSource.getRepository(BoletaEnvioHistorial);

    const service = new BoletasService(boletaRepo, solRepo, dataSource, {} as any);
    const resultado = await service.anular(boletaId, { motivo: 'Anulación aprobada en control de calidad' }, '55');

    expect(resultado.estado).toBe(EstadoBoleta.ANULADA);
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0].cantidad).toBe('10.0000');

    // Confirmación directa en PostgreSQL
    const boletaEnBd = await boletaRepo.findOne({ where: { id: boletaId }, relations: { items: true } });
    expect(boletaEnBd!.estado).toBe(EstadoBoleta.ANULADA);
    expect(boletaEnBd!.items).toHaveLength(1);

    const historialEnBd = await historialRepo.find({ where: { boletaId } });
    expect(historialEnBd).toHaveLength(1);
    expect(historialEnBd[0].estadoAnterior).toBe(EstadoBoleta.EMITIDA);
    expect(historialEnBd[0].estadoNuevo).toBe(EstadoBoleta.ANULADA);
    expect(historialEnBd[0].usuarioActorId).toBe('55');
    expect(historialEnBd[0].motivo).toBe('Anulación aprobada en control de calidad');
  });

  it('ABC-246: dos llamadas concurrentes a service.anular en la misma boleta resultan en una exitosa y una rechazada con 409 Conflict', async () => {
    const { boletaId } = await crearSolicitudYBoleta(EstadoBoleta.EMITIDA);
    const boletaRepo = dataSource.getRepository(BoletaEnvio);
    const solRepo = dataSource.getRepository(SolicitudSalida);
    const historialRepo = dataSource.getRepository(BoletaEnvioHistorial);

    const service = new BoletasService(boletaRepo, solRepo, dataSource, {} as any);

    const [r1, r2] = await Promise.allSettled([
      service.anular(boletaId, { motivo: 'Anulación solicitante A' }, '11'),
      service.anular(boletaId, { motivo: 'Anulación solicitante B' }, '12'),
    ]);

    const exitosos = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rechazados = [r1, r2].filter((r) => r.status === 'rejected');

    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect((rechazados[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    // En PostgreSQL solo debe haber exactamente un registro de auditoría
    const historialEnBd = await historialRepo.find({ where: { boletaId } });
    expect(historialEnBd).toHaveLength(1);

    const boletaEnBd = await boletaRepo.findOne({ where: { id: boletaId } });
    expect(boletaEnBd!.estado).toBe(EstadoBoleta.ANULADA);
  });

  it('ABC-246: rechaza anular una boleta en BORRADOR con 409 Conflict', async () => {
    const { boletaId } = await crearSolicitudYBoleta(EstadoBoleta.BORRADOR);
    const boletaRepo = dataSource.getRepository(BoletaEnvio);
    const solRepo = dataSource.getRepository(SolicitudSalida);

    const service = new BoletasService(boletaRepo, solRepo, dataSource, {} as any);
    await expect(service.anular(boletaId, { motivo: 'Intento en borrador' }, '11'))
      .rejects.toThrow(ConflictException);
  });

  it('ABC-246: una boleta anulada deja de descontar saldo documental para la orden', async () => {
    const { boletaId, ordenId } = await crearSolicitudYBoleta(EstadoBoleta.EMITIDA);
    const boletaRepo = dataSource.getRepository(BoletaEnvio);
    const solRepo = dataSource.getRepository(SolicitudSalida);

    // Saldo emitido antes de anular (debe ser 10.0000)
    const [antes] = await dataSource.query(
      `SELECT COALESCE(SUM(item.cantidad), 0)::text AS total
         FROM boletas_envio boleta
         INNER JOIN boletas_envio_items item ON item.boleta_id = boleta.id
         INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
        WHERE solicitud.orden_id = $1 AND boleta.estado = $2`,
      [ordenId, EstadoBoleta.EMITIDA],
    );
    expect(antes.total).toBe('10.0000');

    // Anulamos la boleta
    const service = new BoletasService(boletaRepo, solRepo, dataSource, {} as any);
    await service.anular(boletaId, { motivo: 'Liberación de saldo para reasignación' }, '42');

    // Saldo emitido después de anular (debe ser 0)
    const [despues] = await dataSource.query(
      `SELECT COALESCE(SUM(item.cantidad), 0)::text AS total
         FROM boletas_envio boleta
         INNER JOIN boletas_envio_items item ON item.boleta_id = boleta.id
         INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
        WHERE solicitud.orden_id = $1 AND boleta.estado = $2`,
      [ordenId, EstadoBoleta.EMITIDA],
    );
    expect(despues.total).toBe('0');
  });
});
