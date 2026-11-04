import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BoletaEnvio } from '../boletas/entities/boleta-envio.entity';
import { BoletaEnvioItem } from '../boletas/entities/boleta-envio-item.entity';
import { BoletaEnvioHistorial } from '../boletas/entities/boleta-envio-historial.entity';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { SolicitudSalidaItem } from '../solicitudes-salida/entities/solicitud-salida-item.entity';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { TrazabilidadController } from './trazabilidad.controller';
import { TrazabilidadService } from './trazabilidad.service';
import { ValidarTrazabilidadQueryPipe } from './dto/validar-trazabilidad-query.pipe';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../database/migrations/1710000000004-HistorialBoletasEnvio';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

describe('Trazabilidad Integration (ABC-306 / HU ABC-305)', () => {
  let moduleRef: TestingModule;
  let controller: TrazabilidadController;
  let service: TrazabilidadService;
  let queryBuilderMock: any;
  let boletaRepoMock: any;
  let produccionMock: any;

  beforeEach(async () => {
    queryBuilderMock = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    boletaRepoMock = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    produccionMock = {
      consultarOrdenPorCodigo: jest.fn(),
      consultarOrdenPorId: jest.fn(),
    };

    moduleRef = await Test.createTestingModule({
      controllers: [TrazabilidadController],
      providers: [
        TrazabilidadService,
        {
          provide: getRepositoryToken(BoletaEnvio),
          useValue: boletaRepoMock,
        },
        {
          provide: LotesProduccionClient,
          useValue: produccionMock,
        },
      ],
    }).compile();

    controller = moduleRef.get<TrazabilidadController>(TrazabilidadController);
    service = moduleRef.get<TrazabilidadService>(TrazabilidadService);
  });

  it('el controlador y servicio están correctamente instanciados e inyectados', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('Criterios de aceptación HU ABC-305 (Pruebas unitarias de flujo)', () => {
    it('Escenario: Rastrear lote -> dado lote L-7, aparecen su orden, boleta y estado documental', async () => {
      const fecha = new Date('2026-10-18T12:00:00Z');
      const boletaLote7 = {
        id: '10',
        numero: 'BOL-2026-00010',
        estado: EstadoBoleta.EMITIDA,
        solicitudSalidaId: '5',
        creadoEn: fecha,
        solicitudSalida: {
          id: '5',
          ordenId: '100',
          destinoDocumental: 'Almacén Central',
        },
        items: [
          { id: '1', referencia: 'L-7', cantidad: '25.0000' },
        ],
        historial: [],
      };

      queryBuilderMock.getMany.mockResolvedValue([boletaLote7]);
      produccionMock.consultarOrdenPorId.mockResolvedValue({ id: '100', codigo: 'ORD-50' });

      const pipe = new ValidarTrazabilidadQueryPipe();
      const query = pipe.transform({ loteId: 'L-7' });

      const resultado = await controller.consultar(query, {
        headers: { authorization: 'Bearer token-supervisor' },
      });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS (SELECT 1 FROM boletas_envio_items'),
        { loteId: 'L-7' },
      );

      expect(resultado).toHaveLength(1);
      expect(resultado[0].numero).toBe('BOL-2026-00010');
      expect(resultado[0].ordenId).toBe('100');
      expect(resultado[0].orden).toBe('ORD-50');
      expect(resultado[0].lote).toBe('L-7');
      expect(resultado[0].estado).toBe(EstadoBoleta.EMITIDA);
      expect(resultado[0].destino).toBe('Almacén Central');
      expect(resultado[0].cantidad).toBe('25.0000');
    });

    it('Escenario: No mezclar órdenes -> al consultar una orden, solo filtra boletas de esa orden', async () => {
      const boletaOrdenA = {
        id: '1',
        numero: 'BOL-2026-00001',
        estado: EstadoBoleta.EMITIDA,
        solicitudSalidaId: '1',
        creadoEn: new Date('2026-10-18T10:00:00Z'),
        solicitudSalida: { id: '1', ordenId: '10', destinoDocumental: 'Almacén 1' },
        items: [{ id: '1', referencia: 'L-1', cantidad: '10.0000' }],
        historial: [],
      };

      queryBuilderMock.getMany.mockResolvedValue([boletaOrdenA]);
      produccionMock.consultarOrdenPorId.mockResolvedValue({ id: '10', codigo: 'ORD-10' });

      const pipe = new ValidarTrazabilidadQueryPipe();
      const query = pipe.transform({ ordenId: '10' });

      const resultado = await controller.consultar(query, {
        headers: { authorization: 'Bearer token-supervisor' },
      });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'solicitud.orden_id = :ordenId',
        { ordenId: '10' },
      );
      expect(resultado).toHaveLength(1);
      expect(resultado[0].ordenId).toBe('10');
      expect(resultado[0].items[0].referencia).toBe('L-1');
    });

    it('Boletas anuladas se distinguen de las emitidas conservando motivo e historial', async () => {
      const fechaAnulacion = new Date('2026-10-18T16:00:00Z');
      const boletaAnulada = {
        id: '2',
        numero: 'BOL-2026-00002',
        estado: EstadoBoleta.ANULADA,
        solicitudSalidaId: '2',
        creadoEn: new Date('2026-10-18T11:00:00Z'),
        solicitudSalida: { id: '2', ordenId: '20', destinoDocumental: 'Almacén 2' },
        items: [{ id: '2', referencia: 'L-2', cantidad: '15.0000' }],
        historial: [
          {
            id: '1',
            estadoAnterior: EstadoBoleta.EMITIDA,
            estadoNuevo: EstadoBoleta.ANULADA,
            usuarioActorId: '99',
            motivo: 'Mercadería dañada en embalaje',
            fechaHora: fechaAnulacion,
          },
        ],
      };

      queryBuilderMock.getMany.mockResolvedValue([boletaAnulada]);

      const pipe = new ValidarTrazabilidadQueryPipe();
      const query = pipe.transform({ boletaId: '2' });

      const resultado = await controller.consultar(query, {
        headers: { authorization: 'Bearer token-supervisor' },
      });

      expect(resultado).toHaveLength(1);
      const item = resultado[0];
      expect(item.estado).toBe(EstadoBoleta.ANULADA);
      expect(item.historial).toHaveLength(1);
      expect(item.historial[0].estadoNuevo).toBe(EstadoBoleta.ANULADA);
      expect(item.historial[0].motivo).toBe('Mercadería dañada en embalaje');
      expect(item.historial[0].usuarioActorId).toBe('99');
      expect(item.historial[0].fechaHora).toBe(fechaAnulacion.toISOString());
    });
  });
});

const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

describeConPostgres('ABC-306: Trazabilidad documental persistida en PostgreSQL real', () => {
  const schema = `abc306_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let trazabilidadService: TrazabilidadService;

  const ORDEN_1 = '77701';
  const ORDEN_2 = '77702';
  let boletaIdOrden1: string;
  let boletaIdOrden2: string;
  let boletaAnuladaId: string;

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
      migrationsTableName: 'migrations_abc306',
      extra: { options: `-c search_path=${schema}` },
    });

    await dataSource.initialize();
    await dataSource.runMigrations();

    const boletaRepo = dataSource.getRepository(BoletaEnvio);
    const solRepo = dataSource.getRepository(SolicitudSalida);
    const itemRepo = dataSource.getRepository(BoletaEnvioItem);
    const historialRepo = dataSource.getRepository(BoletaEnvioHistorial);

    // Preparar datos de prueba para dos órdenes independientes
    // 1. Solicitud y Boleta para Orden 1 (con 2 lotes diferentes)
    const sol1 = await solRepo.save(
      solRepo.create({
        ordenId: ORDEN_1,
        destinoDocumental: 'Almacén Principal Metropolitano',
        motivo: 'Despacho regular Orden 1',
        responsableUsuarioId: '10',
        estado: 'PREPARADA',
      }),
    );

    const bol1 = await boletaRepo.save(
      boletaRepo.create({
        solicitudSalidaId: sol1.id,
        estado: EstadoBoleta.EMITIDA,
        numero: 'BOL-ORD1-00001',
        responsableUsuarioId: '10',
      }),
    );
    boletaIdOrden1 = bol1.id;

    await itemRepo.save([
      itemRepo.create({
        boletaId: bol1.id,
        referencia: 'LOT-ORD1-A',
        cantidad: '12.5000',
      }),
      itemRepo.create({
        boletaId: bol1.id,
        referencia: 'LOT-ORD1-B',
        cantidad: '7.5000',
      }),
    ]);

    // 2. Solicitud y Boleta para Orden 2 (con 1 lote)
    const sol2 = await solRepo.save(
      solRepo.create({
        ordenId: ORDEN_2,
        destinoDocumental: 'Depósito Regional Este',
        motivo: 'Despacho regular Orden 2',
        responsableUsuarioId: '20',
        estado: 'PREPARADA',
      }),
    );

    const bol2 = await boletaRepo.save(
      boletaRepo.create({
        solicitudSalidaId: sol2.id,
        estado: EstadoBoleta.EMITIDA,
        numero: 'BOL-ORD2-00002',
        responsableUsuarioId: '20',
      }),
    );
    boletaIdOrden2 = bol2.id;

    await itemRepo.save(
      itemRepo.create({
        boletaId: bol2.id,
        referencia: 'LOT-ORD2-X',
        cantidad: '30.0000',
      }),
    );

    // 3. Boleta ANULADA en Orden 1 con historial
    const bolAnulada = await boletaRepo.save(
      boletaRepo.create({
        solicitudSalidaId: sol1.id,
        estado: EstadoBoleta.ANULADA,
        numero: 'BOL-ORD1-ANULADA',
        responsableUsuarioId: '10',
      }),
    );
    boletaAnuladaId = bolAnulada.id;

    await itemRepo.save(
      itemRepo.create({
        boletaId: bolAnulada.id,
        referencia: 'LOT-ORD1-CANCEL',
        cantidad: '5.0000',
      }),
    );

    await historialRepo.save(
      historialRepo.create({
        boletaId: bolAnulada.id,
        estadoAnterior: EstadoBoleta.EMITIDA,
        estadoNuevo: EstadoBoleta.ANULADA,
        usuarioActorId: '88',
        motivo: 'Cancelación autorizada por inspección de calidad',
      }),
    );

    trazabilidadService = new TrazabilidadService(boletaRepo);
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
      if (!/^abc306_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('PostgreSQL: No mezclar órdenes -> la consulta por Orden 1 no contiene boletas ni ítems de la Orden 2', async () => {
    const resultados = await trazabilidadService.consultar({ ordenId: ORDEN_1 });

    expect(resultados.length).toBeGreaterThanOrEqual(2);

    // Todas las boletas deben pertenecer exclusivamente a la Orden 1
    for (const b of resultados) {
      expect(b.ordenId).toBe(ORDEN_1);
      expect(b.destino).toBe('Almacén Principal Metropolitano');
    }

    // Ningún ítem de la Orden 2 debe aparecer
    const todosLosLotes = resultados.flatMap((b) => b.items.map((it) => it.referencia));
    expect(todosLosLotes).toContain('LOT-ORD1-A');
    expect(todosLosLotes).toContain('LOT-ORD1-B');
    expect(todosLosLotes).toContain('LOT-ORD1-CANCEL');
    expect(todosLosLotes).not.toContain('LOT-ORD2-X');

    // Ninguna boleta de la Orden 2 debe estar presente
    const boletaIds = resultados.map((b) => b.id);
    expect(boletaIds).toContain(boletaIdOrden1);
    expect(boletaIds).toContain(boletaAnuladaId);
    expect(boletaIds).not.toContain(boletaIdOrden2);
  });

  it('PostgreSQL: No mezclar órdenes -> la consulta por Orden 2 no contiene boletas ni ítems de la Orden 1', async () => {
    const resultados = await trazabilidadService.consultar({ ordenId: ORDEN_2 });

    expect(resultados).toHaveLength(1);
    expect(resultados[0].id).toBe(boletaIdOrden2);
    expect(resultados[0].numero).toBe('BOL-ORD2-00002');
    expect(resultados[0].ordenId).toBe(ORDEN_2);
    expect(resultados[0].destino).toBe('Depósito Regional Este');
    expect(resultados[0].items).toHaveLength(1);
    expect(resultados[0].items[0].referencia).toBe('LOT-ORD2-X');
    expect(resultados[0].cantidad).toBe('30.0000');

    // Confirmación de que no hay rastros de la Orden 1
    const ids = resultados.map((b) => b.id);
    expect(ids).not.toContain(boletaIdOrden1);
    expect(ids).not.toContain(boletaAnuladaId);
  });

  it('PostgreSQL: Conserva todos los lotes e ítems en boletas con múltiples ítems', async () => {
    const resultados = await trazabilidadService.consultar({ boletaId: boletaIdOrden1 });

    expect(resultados).toHaveLength(1);
    const boleta = resultados[0];

    expect(boleta.id).toBe(boletaIdOrden1);
    expect(boleta.numero).toBe('BOL-ORD1-00001');
    expect(boleta.items).toHaveLength(2);

    expect(boleta.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referencia: 'LOT-ORD1-A', cantidad: '12.5000' }),
        expect.objectContaining({ referencia: 'LOT-ORD1-B', cantidad: '7.5000' }),
      ]),
    );

    // Suma total calculada 12.5 + 7.5 = 20.0000
    expect(boleta.cantidad).toBe('20.0000');
  });

  it('PostgreSQL: Rastrear lote -> dado LOT-ORD2-X encuentra solo su boleta y orden correspondiente', async () => {
    const resultados = await trazabilidadService.consultar({ loteId: 'LOT-ORD2-X' });

    expect(resultados).toHaveLength(1);
    expect(resultados[0].id).toBe(boletaIdOrden2);
    expect(resultados[0].ordenId).toBe(ORDEN_2);
    expect(resultados[0].estado).toBe(EstadoBoleta.EMITIDA);
  });

  it('PostgreSQL: Boletas anuladas se distinguen de las emitidas conservando motivo e historial', async () => {
    const resultados = await trazabilidadService.consultar({ boletaId: boletaAnuladaId });

    expect(resultados).toHaveLength(1);
    const boleta = resultados[0];

    expect(boleta.id).toBe(boletaAnuladaId);
    expect(boleta.numero).toBe('BOL-ORD1-ANULADA');
    expect(boleta.estado).toBe(EstadoBoleta.ANULADA);
    expect(boleta.historial).toHaveLength(1);

    const h = boleta.historial[0];
    expect(h.evento).toBe('Anulación de boleta');
    expect(h.estadoAnterior).toBe(EstadoBoleta.EMITIDA);
    expect(h.estadoNuevo).toBe(EstadoBoleta.ANULADA);
    expect(h.estado).toBe(EstadoBoleta.ANULADA);
    expect(h.usuarioActorId).toBe('88');
    expect(h.motivo).toBe('Cancelación autorizada por inspección de calidad');
    expect(h.fechaHora).toBeDefined();
  });

  it('PostgreSQL: Búsqueda q por texto coincide con destino y número', async () => {
    const porDestino = await trazabilidadService.consultar({ q: 'Metropolitano' });
    expect(porDestino.some((b) => b.id === boletaIdOrden1)).toBe(true);
    expect(porDestino.some((b) => b.id === boletaIdOrden2)).toBe(false);

    const porNumero = await trazabilidadService.consultar({ q: 'ORD2-00002' });
    expect(porNumero).toHaveLength(1);
    expect(porNumero[0].id).toBe(boletaIdOrden2);
  });

  it('PostgreSQL: Consulta sin criterios devuelve arreglo vacío sin volcado indiscriminado', async () => {
    const resultados = await trazabilidadService.consultar({});
    expect(resultados).toEqual([]);
  });
});
