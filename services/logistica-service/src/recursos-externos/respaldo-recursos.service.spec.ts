import 'reflect-metadata';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RespaldoRecursosTypeOrmService } from './respaldo-recursos.service';
import { CopiaRecursosLogisticos } from './respaldo-recursos';
import { EJEMPLO_RESPUESTA_RECURSOS_V1 } from './dto/recursos-logisticos-v1';
import { RecursoExternoSnapshot } from './entities/recurso-externo-snapshot.entity';
import { RecursoExternoVehiculo } from './entities/recurso-externo-vehiculo.entity';
import { RecursoExternoChofer } from './entities/recurso-externo-chofer.entity';

describe('ABC-352: RespaldoRecursosTypeOrmService (pruebas unitarias)', () => {
  const FECHA = '2026-11-10';
  const COPIA_TEST: CopiaRecursosLogisticos = {
    sincronizadoEn: '2026-11-09T22:00:00.000Z',
    respuesta: {
      ...EJEMPLO_RESPUESTA_RECURSOS_V1,
      fecha: FECHA,
    },
  };

  it('devuelve null en obtener() si el dataSource es nulo o no está inicializado', async () => {
    const serviceSinDs = new RespaldoRecursosTypeOrmService(undefined);
    await expect(serviceSinDs.obtener(FECHA)).resolves.toBeNull();

    const dsNoIniciado = { isInitialized: false } as unknown as DataSource;
    const serviceNoIniciado = new RespaldoRecursosTypeOrmService(dsNoIniciado);
    await expect(serviceNoIniciado.obtener(FECHA)).resolves.toBeNull();
  });

  it('devuelve null en obtener() si no existe ningún snapshot guardado para esa fecha', async () => {
    const snapshotRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const ds = {
      isInitialized: true,
      getRepository: jest.fn().mockReturnValue(snapshotRepo),
    } as unknown as DataSource;

    const service = new RespaldoRecursosTypeOrmService(ds);
    const resultado = await service.obtener(FECHA);

    expect(resultado).toBeNull();
    expect(snapshotRepo.findOne).toHaveBeenCalledWith({
      where: { fecha: FECHA },
      order: { sincronizadoEn: 'DESC' },
    });
  });

  it('devuelve CopiaRecursosLogisticos en obtener() reconstruida desde el snapshot de la base de datos', async () => {
    const mockSnapshot = {
      id: '1',
      fecha: FECHA,
      version: 'recursos-logisticos.v1',
      generadoEn: new Date('2026-11-09T21:00:00.000Z'),
      sincronizadoEn: new Date('2026-11-09T22:00:00.000Z'),
      datos: EJEMPLO_RESPUESTA_RECURSOS_V1,
    };
    const snapshotRepo = {
      findOne: jest.fn().mockResolvedValue(mockSnapshot),
    };
    const ds = {
      isInitialized: true,
      getRepository: jest.fn().mockReturnValue(snapshotRepo),
    } as unknown as DataSource;

    const service = new RespaldoRecursosTypeOrmService(ds);
    const resultado = await service.obtener(FECHA);

    expect(resultado).not.toBeNull();
    expect(resultado?.sincronizadoEn).toBe('2026-11-09T22:00:00.000Z');
    expect(resultado?.respuesta.version).toBe('recursos-logisticos.v1');
    expect(resultado?.respuesta.vehiculos).toHaveLength(EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos.length);
    expect(resultado?.respuesta.choferes).toHaveLength(EJEMPLO_RESPUESTA_RECURSOS_V1.choferes.length);
  });

  it('ignora reemplazar() sin fallar si el dataSource no está inicializado', async () => {
    const dsNoIniciado = { isInitialized: false } as unknown as DataSource;
    const service = new RespaldoRecursosTypeOrmService(dsNoIniciado);

    await expect(service.reemplazar(COPIA_TEST)).resolves.toBeUndefined();
  });

  it('ejecuta reemplazar() de forma transaccional eliminando copia previa y guardando nuevo snapshot e hijos', async () => {
    const snapshotRepo = {
      findOne: jest.fn().mockResolvedValue({ id: '99', fecha: FECHA }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((data) => ({ id: '100', ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    const vehiculoRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((entities) => Promise.resolve(entities)),
    };
    const choferRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((entities) => Promise.resolve(entities)),
    };

    const manager = {
      getRepository: jest.fn().mockImplementation((target) => {
        if (target === RecursoExternoSnapshot) return snapshotRepo;
        if (target === RecursoExternoVehiculo) return vehiculoRepo;
        if (target === RecursoExternoChofer) return choferRepo;
        return null;
      }),
    } as unknown as EntityManager;

    const ds = {
      isInitialized: true,
      transaction: jest.fn().mockImplementation(async (cb) => cb(manager)),
    } as unknown as DataSource;

    const service = new RespaldoRecursosTypeOrmService(ds);
    await service.reemplazar(COPIA_TEST);

    expect(ds.transaction).toHaveBeenCalledTimes(1);
    expect(snapshotRepo.findOne).toHaveBeenCalledWith({ where: { fecha: FECHA } });
    expect(snapshotRepo.delete).toHaveBeenCalledWith({ id: '99' });
    expect(snapshotRepo.save).toHaveBeenCalled();
    expect(vehiculoRepo.save).toHaveBeenCalled();
    expect(choferRepo.save).toHaveBeenCalled();
  });

  it('propaga error si la transacción de reemplazar() falla, dejando intacto el estado', async () => {
    const errorFallo = new Error('Violación de clave única en base de datos');
    const ds = {
      isInitialized: true,
      transaction: jest.fn().mockRejectedValue(errorFallo),
    } as unknown as DataSource;

    const service = new RespaldoRecursosTypeOrmService(ds);
    await expect(service.reemplazar(COPIA_TEST)).rejects.toThrow(errorFallo);
  });
});
