import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../database/migrations/1710000000004-HistorialBoletasEnvio';
import { ProductoUnidadBoleta1710000000013 } from '../database/migrations/1710000000013-ProductoUnidadBoleta';
import { CrearRutas1710000000005 } from '../database/migrations/1710000000005-CrearRutas';
import { EstadosDespachoEntrega1710000000006 } from '../database/migrations/1710000000006-EstadosDespachoEntrega';
import { CrearRespaldoRecursosLogisticos1710000000007 } from '../database/migrations/1710000000007-CrearRespaldoRecursosLogisticos';
import { ObservacionesDespachoEntrega1710000000008 } from '../database/migrations/1710000000008-ObservacionesDespachoEntrega';
import { CrearIncidenciasTransporte1710000000009 } from '../database/migrations/1710000000009-CrearIncidenciasTransporte';
import { CrearGruposSalida1710000000010 } from '../database/migrations/1710000000010-CrearGruposSalida';
import { EventosOutboxLogistica1710000000011 } from '../database/migrations/1710000000011-EventosOutboxLogistica';
import { ResultadoInventarioRuta1710000000012 } from '../database/migrations/1710000000012-ResultadoInventarioRuta';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { Ruta } from '../rutas/entities/ruta.entity';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { AgrupacionService } from './agrupacion.service';
import { GrupoSalida } from './entities/grupo-salida.entity';
import { GrupoSolicitud } from './entities/grupo-solicitud.entity';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// PRUEBA REAL (ABC-363): se habilita de forma explícita porque crea y elimina
// un esquema temporal en PostgreSQL. No usa dobles para persistencia ni bloqueo.
const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

describeConPostgres('ABC-363: aceptación y regresión de agrupaciones con PostgreSQL', () => {
  const schema = `abc363_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let service: AgrupacionService;
  let siguienteOrden = 100;

  const entradas = (solicitudes: SolicitudSalida[]) => solicitudes.map(({ id }) => ({
    solicitudId: id,
    fechaRequerida: '2026-11-12',
    tipoCarga: 'Seca',
  }));

  async function crearSolicitudes(cantidad: number, cambios: Partial<SolicitudSalida> = {}) {
    const repositorio = dataSource.getRepository(SolicitudSalida);
    const ordenId = String(siguienteOrden++);
    return repositorio.save(Array.from({ length: cantidad }, (_, indice) => repositorio.create({
      ordenId,
      destinoDocumental: 'Zona Sur - Tienda Central',
      motivo: `ABC-363 caso ${ordenId}-${indice + 1}`,
      responsableUsuarioId: '42',
      estado: 'PREPARADA',
      ...cambios,
    })));
  }

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
      entities: [path.join(__dirname, '../**/*.entity{.ts,.js}')],
      migrations: [
        CrearSolicitudesSalida1710000000001,
        CrearBoletasEnvio1710000000002,
        ReglaConcurrenciaDocumental1710000000003,
        HistorialBoletasEnvio1710000000004,
        ProductoUnidadBoleta1710000000013,
        CrearRutas1710000000005,
        EstadosDespachoEntrega1710000000006,
        CrearRespaldoRecursosLogisticos1710000000007,
        ObservacionesDespachoEntrega1710000000008,
        CrearIncidenciasTransporte1710000000009,
        CrearGruposSalida1710000000010,
        EventosOutboxLogistica1710000000011,
        ResultadoInventarioRuta1710000000012,
      ],
      migrationsTableName: 'migrations_abc363',
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const produccion = {
      consultarOrdenPorId: jest.fn(async (ordenId: string) => ({
        id: ordenId,
        codigo: `ORD-${ordenId}`,
        producto_id: 1,
        producto: { codigo: 'P-1', unidad_producto: 'kg' },
      })),
    } as unknown as LotesProduccionClient;
    service = new AgrupacionService(dataSource, produccion);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
      if (!/^abc363_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('persiste grupo, miembros, autor y fecha; deshacer libera todo atómicamente y permite reagrupar', async () => {
    const solicitudes = await crearSolicitudes(2);
    const grupo = await service.agrupar(entradas(solicitudes), '42', 'Bearer prueba');

    const persistido = await dataSource.getRepository(GrupoSalida).findOneByOrFail({ id: grupo.id });
    const miembros = await dataSource.getRepository(GrupoSolicitud).findBy({ grupoId: grupo.id });
    expect(persistido).toMatchObject({ creadoPorUsuarioId: '42', deshechoEn: null, deshechoPorUsuarioId: null });
    expect(persistido.creadoEn).toBeInstanceOf(Date);
    expect(miembros.map(({ solicitudId }) => solicitudId).sort()).toEqual(solicitudes.map(({ id }) => id).sort());
    expect(miembros.every(({ liberadaEn }) => liberadaEn === null)).toBe(true);

    const ruta = await dataSource.getRepository(Ruta).save({
      grupoId: grupo.id,
      fechaProgramada: '2026-11-12',
      vehiculoExternoId: 'VEH-ABC363',
      choferExternoId: 'CHO-ABC363',
      estado: EstadoRuta.PLANIFICADA,
      responsableUsuarioId: '42',
      despachadaEn: null,
      despachadaPorUsuarioId: null,
      despachoObservacion: null,
      completadaEn: null,
    });
    const resultado = await service.deshacer(grupo.id, '77');

    const deshecho = await dataSource.getRepository(GrupoSalida).findOneByOrFail({ id: grupo.id });
    const liberados = await dataSource.getRepository(GrupoSolicitud).findBy({ grupoId: grupo.id });
    expect(resultado.deshechoEn).toBeInstanceOf(Date);
    expect(deshecho).toMatchObject({ deshechoPorUsuarioId: '77' });
    expect(deshecho.deshechoEn).toEqual(resultado.deshechoEn);
    expect(liberados.every(({ liberadaEn }) => liberadaEn?.getTime() === resultado.deshechoEn.getTime())).toBe(true);
    await expect(dataSource.getRepository(Ruta).findOneByOrFail({ id: ruta.id }))
      .resolves.toMatchObject({ grupoId: null });
    await expect(service.agrupar(entradas(solicitudes), '88', 'Bearer prueba'))
      .resolves.toMatchObject({ creadoPorUsuarioId: '88' });
  });

  it('rechaza incompatibles sin dejar grupo ni pertenencias parciales', async () => {
    const solicitudes = await crearSolicitudes(2);
    solicitudes[1].destinoDocumental = 'Zona Norte';
    await dataSource.getRepository(SolicitudSalida).save(solicitudes[1]);
    const gruposAntes = await dataSource.getRepository(GrupoSalida).count();
    const miembrosAntes = await dataSource.getRepository(GrupoSolicitud).count();

    await expect(service.agrupar(entradas(solicitudes), '42', 'Bearer prueba'))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(dataSource.getRepository(GrupoSalida).count()).resolves.toBe(gruposAntes);
    await expect(dataSource.getRepository(GrupoSolicitud).count()).resolves.toBe(miembrosAntes);
  });

  it('dos agrupaciones concurrentes sobre una solicitud producen un éxito y un conflicto', async () => {
    const solicitudes = await crearSolicitudes(3);
    const resultados = await Promise.allSettled([
      service.agrupar(entradas([solicitudes[0], solicitudes[1]]), '42', 'Bearer uno'),
      service.agrupar(entradas([solicitudes[0], solicitudes[2]]), '43', 'Bearer dos'),
    ]);

    expect(resultados.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rechazado = resultados.find(({ status }) => status === 'rejected') as PromiseRejectedResult;
    expect(rechazado.reason).toBeInstanceOf(ConflictException);
    const pertenencias = await dataSource.getRepository(GrupoSolicitud).findBy({ solicitudId: solicitudes[0].id });
    expect(pertenencias.filter(({ liberadaEn }) => liberadaEn === null)).toHaveLength(1);
  });

  it('un grupo despachado no se deshace ni pierde sus miembros', async () => {
    const solicitudes = await crearSolicitudes(2);
    const grupo = await service.agrupar(entradas(solicitudes), '42', 'Bearer prueba');
    await dataSource.getRepository(Ruta).save({
      grupoId: grupo.id,
      fechaProgramada: '2026-11-12',
      vehiculoExternoId: 'VEH-DESPACHADO',
      choferExternoId: 'CHO-DESPACHADO',
      estado: EstadoRuta.DESPACHADA,
      responsableUsuarioId: '42',
      despachadaEn: new Date('2026-11-10T18:00:00.000Z'),
      despachadaPorUsuarioId: '42',
      despachoObservacion: 'Salida verificada ABC-363',
      completadaEn: null,
    });

    await expect(service.deshacer(grupo.id, '77')).rejects.toThrow('El grupo ya fue despachado');
    await expect(dataSource.getRepository(GrupoSalida).findOneByOrFail({ id: grupo.id }))
      .resolves.toMatchObject({ deshechoEn: null, deshechoPorUsuarioId: null });
    const miembros = await dataSource.getRepository(GrupoSolicitud).findBy({ grupoId: grupo.id });
    expect(miembros.every(({ liberadaEn }) => liberadaEn === null)).toBe(true);
  });
});
