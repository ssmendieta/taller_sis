import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { GuardarRutaDto } from './dto/guardar-ruta.dto';
import { RutaParadaBoleta } from './entities/ruta-parada-boleta.entity';
import { RutaParada } from './entities/ruta-parada.entity';
import { Ruta } from './entities/ruta.entity';
import { RutasService } from './rutas.service';

const dto = (): GuardarRutaDto => ({
  grupoId: null,
  fechaProgramada: '2026-11-10',
  vehiculoExternoId: 'VEH-01',
  choferExternoId: 'CHO-07',
  paradas: [
    { destino: 'Tienda Central', boletaIds: ['1', '2'] },
    { destino: 'Sucursal Norte', boletaIds: ['3'] },
  ],
});

describe('ABC-370: RutasService', () => {
  let service: RutasService;
  let manager: any;
  let dataSource: any;
  let rutas: any;
  let boletas: Array<{ id: string; estado: string }>;
  let ocupadas: Array<{ boleta_id: string; ruta_id: string }>;
  let rutaActual: Array<{ id: string; estado: string }>;
  let paradaId: number;

  beforeEach(() => {
    boletas = [
      { id: '1', estado: 'EMITIDA' },
      { id: '2', estado: 'EMITIDA' },
      { id: '3', estado: 'EMITIDA' },
    ];
    ocupadas = [];
    rutaActual = [{ id: '9', estado: 'PLANIFICADA' }];
    paradaId = 100;
    manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM boletas_envio')) return boletas;
        if (sql.includes('FROM rutas_paradas_boletas')) return ocupadas;
        if (sql.includes('FROM rutas WHERE id')) return rutaActual;
        return [];
      }),
      save: jest.fn(async (entity: unknown, value: any) => {
        if (entity === Ruta) return { id: '9', ...value };
        if (entity === RutaParada) return { id: String(paradaId++), ...value };
        return value;
      }),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      update: jest.fn(),
      delete: jest.fn(),
      findOne: jest.fn(async () => ({ id: '9', paradas: [] })),
    };
    dataSource = { transaction: jest.fn(async (callback: any) => callback(manager)) };
    rutas = { find: jest.fn(), findOne: jest.fn() };
    // Las validaciones de ABC-371 tienen sus propias pruebas en validaciones/.
    const validacion = { consultarDatosExternos: jest.fn(async () => ({})), bloquearRecursos: jest.fn(), validar: jest.fn() };
    service = new RutasService(rutas as Repository<Ruta>, dataSource as DataSource, validacion as any);
  });

  it('crea la ruta PLANIFICADA con el responsable de la sesión, paradas numeradas y boletas', async () => {
    await service.create(dto(), '42');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(Ruta, expect.objectContaining({
      estado: 'PLANIFICADA', responsableUsuarioId: '42', vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-07',
    }));
    expect(manager.save).toHaveBeenCalledWith(RutaParada, { rutaId: '9', secuencia: 1, destino: 'Tienda Central' });
    expect(manager.save).toHaveBeenCalledWith(RutaParada, { rutaId: '9', secuencia: 2, destino: 'Sucursal Norte' });
    expect(manager.save).toHaveBeenCalledWith(RutaParadaBoleta, [
      { paradaId: '100', boletaId: '1' },
      { paradaId: '100', boletaId: '2' },
    ]);
    expect(manager.save).toHaveBeenCalledWith(RutaParadaBoleta, [{ paradaId: '101', boletaId: '3' }]);
  });

  it('bloquea las boletas con FOR UPDATE antes de comprobar si están ocupadas', async () => {
    await service.create(dto(), '42');
    const sql = manager.query.mock.calls.map(([s]: [string]) => s);
    expect(sql[0]).toContain('FOR UPDATE');
    expect(sql[1]).toContain('FROM rutas_paradas_boletas');
  });

  it('rechaza una boleta inexistente sin guardar nada', async () => {
    boletas = boletas.slice(0, 2);
    await expect(service.create(dto(), '42')).rejects.toThrow(new NotFoundException('Boletas no encontradas: 3'));
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza boletas anuladas o en borrador', async () => {
    boletas[1].estado = 'ANULADA';
    boletas[2].estado = 'BORRADOR';
    await expect(service.create(dto(), '42')).rejects.toThrow(ConflictException);
    await expect(service.create(dto(), '42')).rejects.toThrow('2 (ANULADA), 3 (BORRADOR)');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza una boleta que ya viaja en otra ruta activa', async () => {
    ocupadas = [{ boleta_id: '2', ruta_id: '5' }];
    await expect(service.create(dto(), '42')).rejects.toThrow('Boletas ya asignadas a otra ruta activa: 2 (ruta 5)');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('al editar excluye la propia ruta de la comprobación de boletas ocupadas', async () => {
    await service.update('9', dto());
    const consulta = manager.query.mock.calls.find(([s]: [string]) => s.includes('FROM rutas_paradas_boletas'));
    expect(consulta[1][2]).toBe('9');
  });

  it('al editar reemplaza datos y paradas de una ruta PLANIFICADA', async () => {
    await service.update('9', dto());
    expect(manager.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(manager.update).toHaveBeenCalledWith(Ruta, { id: '9' }, expect.objectContaining({ vehiculoExternoId: 'VEH-01' }));
    expect(manager.delete).toHaveBeenCalledWith(RutaParada, { rutaId: '9' });
    expect(manager.save).toHaveBeenCalledWith(RutaParada, expect.objectContaining({ rutaId: '9', secuencia: 1 }));
  });

  it.each(['DESPACHADA', 'COMPLETADA', 'CANCELADA'])('no permite editar una ruta %s', async (estado) => {
    rutaActual = [{ id: '9', estado }];
    await expect(service.update('9', dto())).rejects.toThrow(ConflictException);
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('responde 404 al editar o consultar una ruta inexistente o con id inválido', async () => {
    rutaActual = [];
    await expect(service.update('9', dto())).rejects.toThrow(NotFoundException);
    await expect(service.update('abc', dto())).rejects.toThrow(NotFoundException);
    await expect(service.findOne('0')).rejects.toThrow(NotFoundException);
    rutas.findOne.mockResolvedValue(null);
    await expect(service.findOne('8')).rejects.toThrow(NotFoundException);
  });

  it('propaga errores de escritura para que la transacción haga rollback', async () => {
    const falla = new Error('falló la parada');
    manager.save.mockImplementation(async (entity: unknown, value: any) => {
      if (entity === RutaParada) throw falla;
      return { id: '9', ...value };
    });
    await expect(service.create(dto(), '42')).rejects.toBe(falla);
  });
});
