import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { RecursoExternoSnapshot } from './entities/recurso-externo-snapshot.entity';
import { RecursoExternoVehiculo } from './entities/recurso-externo-vehiculo.entity';
import { RecursoExternoChofer } from './entities/recurso-externo-chofer.entity';
import { CrearRespaldoRecursosLogisticos1710000000007 } from '../database/migrations/1710000000007-CrearRespaldoRecursosLogisticos';
import { RespaldoRecursosTypeOrmService } from './respaldo-recursos.service';
import { RecursosLogisticosService } from './recursos-logisticos.service';
import { ErpRecursosClient } from './clientes/erp-recursos.client';
import {
  EJEMPLO_RESPUESTA_RECURSOS_V1,
  ErpRecursosNoDisponibleError,
} from './dto/recursos-logisticos-v1';
import { CopiaRecursosLogisticos } from './respaldo-recursos';

describe('ABC-352: Persistencia de respaldo de recursos logísticos (metadatos, migración y flujo)', () => {
  const FECHA = '2026-11-10';

  it('registra las entidades de snapshot, vehículos y choferes en el storage de TypeORM', () => {
    const tables = getMetadataArgsStorage().tables;
    expect(tables.some((t) => t.target === RecursoExternoSnapshot && t.name === 'recursos_externos_snapshots')).toBe(true);
    expect(tables.some((t) => t.target === RecursoExternoVehiculo && t.name === 'recursos_externos_vehiculos')).toBe(true);
    expect(tables.some((t) => t.target === RecursoExternoChofer && t.name === 'recursos_externos_choferes')).toBe(true);
  });

  it('conserva campos clave: fecha, versión, sincronizadoEn, idExterno, capacidad y disponibilidad', () => {
    const columnasSnapshot = getMetadataArgsStorage().columns
      .filter((c) => c.target === RecursoExternoSnapshot)
      .map((c) => c.propertyName);
    expect(columnasSnapshot).toEqual(expect.arrayContaining([
      'fecha', 'version', 'generadoEn', 'sincronizadoEn', 'datos',
    ]));

    const columnasVehiculo = getMetadataArgsStorage().columns
      .filter((c) => c.target === RecursoExternoVehiculo)
      .map((c) => c.propertyName);
    expect(columnasVehiculo).toEqual(expect.arrayContaining([
      'snapshotId', 'fecha', 'idExterno', 'placa', 'descripcion', 'capacidadValor', 'capacidadUnidad', 'disponible',
    ]));

    const columnasChofer = getMetadataArgsStorage().columns
      .filter((c) => c.target === RecursoExternoChofer)
      .map((c) => c.propertyName);
    expect(columnasChofer).toEqual(expect.arrayContaining([
      'snapshotId', 'fecha', 'idExterno', 'nombre', 'licenciaCategoria', 'disponible',
    ]));
  });

  it('declara restricciones únicas y checks para evitar duplicación por id externo', () => {
    const uniques = getMetadataArgsStorage().uniques
      .filter((u) => [RecursoExternoVehiculo, RecursoExternoChofer].includes(u.target as any))
      .map((u) => u.name);
    expect(uniques).toContain('uq_recurso_vehiculo_snapshot_ext');
    expect(uniques).toContain('uq_recurso_chofer_snapshot_ext');

    const checks = getMetadataArgsStorage().checks
      .filter((c) => [RecursoExternoVehiculo, RecursoExternoChofer].includes(c.target as any))
      .map((c) => c.name);
    expect(checks).toEqual(expect.arrayContaining([
      'ck_recurso_vehiculo_id',
      'ck_recurso_vehiculo_placa',
      'ck_recurso_chofer_id',
      'ck_recurso_chofer_nombre',
    ]));
  });

  it('la migración up crea las tres tablas y sus índices con soporte JSONB y restricciones', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new CrearRespaldoRecursosLogisticos1710000000007().up({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain('CREATE TABLE recursos_externos_snapshots (');
    expect(sql).toContain('datos JSONB NOT NULL');
    expect(sql).toContain('uq_recursos_snapshot_fecha UNIQUE (fecha)');
    expect(sql).toContain('CREATE TABLE recursos_externos_vehiculos (');
    expect(sql).toContain('uq_recurso_vehiculo_snapshot_ext UNIQUE (snapshot_id, id_externo)');
    expect(sql).toContain('CREATE TABLE recursos_externos_choferes (');
    expect(sql).toContain('uq_recurso_chofer_snapshot_ext UNIQUE (snapshot_id, id_externo)');
  });

  it('la migración down elimina las tablas de respaldo en cascada', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new CrearRespaldoRecursosLogisticos1710000000007().down({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain('DROP TABLE IF EXISTS recursos_externos_choferes CASCADE;');
    expect(sql).toContain('DROP TABLE IF EXISTS recursos_externos_vehiculos CASCADE;');
    expect(sql).toContain('DROP TABLE IF EXISTS recursos_externos_snapshots CASCADE;');
  });

  it('simula reinicio del servicio: recupera la copia intacta tras instanciar un nuevo servicio sobre la BD', async () => {
    // Almacenamiento en memoria simulando las tablas de PostgreSQL
    const bdSimulada = new Map<string, any>();

    const managerMock = {
      getRepository: (entidad: any) => ({
        findOne: async ({ where }: any) => bdSimulada.get(where.fecha) ?? null,
        delete: async ({ id }: any) => {
          for (const [k, v] of bdSimulada.entries()) {
            if (v.id === id) bdSimulada.delete(k);
          }
        },
        create: (data: any) => ({ id: 'snap-1', ...data }),
        save: async (entity: any) => {
          if (Array.isArray(entity)) return entity;
          bdSimulada.set(entity.fecha, entity);
          return entity;
        },
      }),
    };

    const dsMock = {
      isInitialized: true,
      transaction: async (cb: any) => cb(managerMock),
      getRepository: (entidad: any) => managerMock.getRepository(entidad),
    };

    // Servicio antes de reiniciar: guarda la copia tras sincronización exitosa
    const servicioAntes = new RespaldoRecursosTypeOrmService(dsMock as any);
    const copiaOriginal: CopiaRecursosLogisticos = {
      sincronizadoEn: '2026-11-09T20:00:00.000Z',
      respuesta: { ...EJEMPLO_RESPUESTA_RECURSOS_V1, fecha: FECHA },
    };
    await servicioAntes.reemplazar(copiaOriginal);

    // Reinicio de la aplicación: se crea una nueva instancia del servicio
    const servicioDespuesDeReinicio = new RespaldoRecursosTypeOrmService(dsMock as any);
    const copiaRecuperada = await servicioDespuesDeReinicio.obtener(FECHA);

    expect(copiaRecuperada).not.toBeNull();
    expect(copiaRecuperada?.sincronizadoEn).toBe('2026-11-09T20:00:00.000Z');
    expect(copiaRecuperada?.respuesta.vehiculos[0].idExterno).toBe('VEH-01');
    expect(copiaRecuperada?.respuesta.choferes[0].idExterno).toBe('CHO-12');
  });

  it('integración con RecursosLogisticosService: si falla el ERP tras haberse respaldado, usa la copia válida persistida', async () => {
    const store = new Map<string, any>();
    const manager = {
      getRepository: () => ({
        findOne: async ({ where }: any) => store.get(where.fecha) ?? null,
        delete: async () => {},
        create: (d: any) => d,
        save: async (d: any) => {
          if (!Array.isArray(d)) store.set(d.fecha, d);
          return d;
        },
      }),
    };
    const ds = {
      isInitialized: true,
      transaction: async (cb: any) => cb(manager),
      getRepository: () => manager.getRepository(),
    };

    const respaldoService = new RespaldoRecursosTypeOrmService(ds as any);
    const mockErpClient = {
      consultarRecursos: jest.fn(),
    } as unknown as ErpRecursosClient;

    const service = new RecursosLogisticosService(mockErpClient, respaldoService);

    // 1. Consulta exitosa: se guarda en el respaldo
    (mockErpClient.consultarRecursos as jest.Mock).mockResolvedValueOnce(EJEMPLO_RESPUESTA_RECURSOS_V1);
    const resErp = await service.consultar({ fecha: FECHA, disponible: null, capacidadMinima: null });
    expect(resErp.origen).toBe('ERP');
    expect(resErp.aviso).toBeNull();

    // 2. Segunda consulta con ERP caído (TIMEOUT): rescata la copia guardada
    (mockErpClient.consultarRecursos as jest.Mock).mockRejectedValueOnce(
      new ErpRecursosNoDisponibleError('TIMEOUT', '504 Gateway Timeout'),
    );

    const resFallo = await service.consultar({ fecha: FECHA, disponible: null, capacidadMinima: null });
    expect(resFallo.origen).toBe('RESPALDO');
    expect(resFallo.aviso).not.toBeNull();
    expect(resFallo.aviso?.motivo).toBe('TIMEOUT');
    expect(resFallo.vehiculos.length).toBeGreaterThan(0);
  });
});
