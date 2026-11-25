import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { Lote } from '../lotes/entities/lote.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { DemandaController, PERMISO_CONSULTAR_DEMANDAS } from './demanda.controller';
import { DemandaService } from './demanda.service';
import { Demanda } from './entities/demanda.entity';

function crearLoteRepoMock(filas: Array<{ ordenId: string; totalProducido: string }>) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(filas),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
}

describe('ABC-449 (ABC-413): Cumplimiento por demanda', () => {
  it('exige PermisoProduccionGuard y ordenes.consultar en GET /demandas/:id/cumplimiento', () => {
    const guards = Reflect.getMetadata('__guards__', DemandaController);
    expect(guards).toContain(PermisoProduccionGuard);

    const reflector = new Reflector();
    const permiso = reflector.get(
      PERMISO_PRODUCCION,
      DemandaController.prototype.obtenerCumplimiento,
    );
    expect(permiso).toBe(PERMISO_CONSULTAR_DEMANDAS);
    expect(permiso).toBe('ordenes.consultar');
  });

  it('el controlador delega obtenerCumplimiento al servicio', async () => {
    const mockRespuesta = {
      demandaId: '10',
      origen: 'VENTAS',
      demandaExternaId: 'PED-10',
      estado: 'CONFIRMADA',
      fechaRequerida: '2026-12-01',
      cantidadPedida: 100,
      cantidadProducida: 50,
      porcentajeCumplido: 50,
      ordenes: [],
    };
    const mockService = {
      obtenerCumplimiento: jest.fn().mockResolvedValue(mockRespuesta),
    } as unknown as DemandaService;

    const controller = new DemandaController(mockService);
    const resultado = await controller.obtenerCumplimiento('10');

    expect(mockService.obtenerCumplimiento).toHaveBeenCalledWith('10');
    expect(resultado).toBe(mockRespuesta);
  });

  it('devuelve 0% cuando la demanda no tiene órdenes', async () => {
    const demandaRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: '1',
        origen: 'VENTAS',
        demandaExternaId: 'PED-001',
        estado: 'CONFIRMADA',
        fechaRequerida: '2026-12-10',
        items: [{ id: '1', productoCodigo: 'P-1', cantidad: '100.0000', unidad: 'kg' }],
      }),
    };
    const ordenRepo = { find: jest.fn().mockResolvedValue([]) };
    const loteRepo = crearLoteRepoMock([]);

    const service = new DemandaService(
      demandaRepo as any,
      ordenRepo as any,
      loteRepo as any,
    );
    const resultado = await service.obtenerCumplimiento('1');

    expect(resultado.cantidadPedida).toBe(100);
    expect(resultado.cantidadProducida).toBe(0);
    expect(resultado.porcentajeCumplido).toBe(0);
    expect(resultado.ordenes).toEqual([]);
  });

  it('calcula cumplimiento parcial sumando lotes de múltiples órdenes', async () => {
    const demandaRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: '2',
        origen: 'FACTURACION',
        demandaExternaId: 'FAC-202',
        estado: 'CONFIRMADA',
        fechaRequerida: '2026-12-15',
        items: [
          { id: '10', productoCodigo: 'P-1', cantidad: '60.0000', unidad: 'kg' },
          { id: '11', productoCodigo: 'P-2', cantidad: '40.0000', unidad: 'kg' },
        ],
      }),
    };
    const ordenRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 101,
          codigo: 'OP-101',
          producto_id: 1,
          estado: 'EN_PROCESO',
          cantidad: 60,
          fecha_programada: '2026-12-10',
          creado_en: new Date('2026-11-20T10:00:00Z'),
        } as OrdenProduccion,
        {
          id: 102,
          codigo: 'OP-102',
          producto_id: 2,
          estado: 'FINALIZADA',
          cantidad: 40,
          fecha_programada: '2026-12-11',
          creado_en: new Date('2026-11-21T10:00:00Z'),
        } as OrdenProduccion,
      ]),
    };
    const loteRepo = crearLoteRepoMock([
      { ordenId: '101', totalProducido: '25.0000' },
      { ordenId: '102', totalProducido: '35.0000' },
    ]);

    const service = new DemandaService(
      demandaRepo as any,
      ordenRepo as any,
      loteRepo as any,
    );
    const resultado = await service.obtenerCumplimiento('2');

    expect(resultado.cantidadPedida).toBe(100);
    expect(resultado.cantidadProducida).toBe(60);
    expect(resultado.porcentajeCumplido).toBe(60);
    expect(resultado.ordenes).toHaveLength(2);
    expect(resultado.ordenes[0]).toMatchObject({
      id: 101,
      codigo: 'OP-101',
      cantidadSolicitada: 60,
      cantidadProducida: 25,
    });
    expect(resultado.ordenes[1]).toMatchObject({
      id: 102,
      codigo: 'OP-102',
      cantidadSolicitada: 40,
      cantidadProducida: 35,
    });
  });

  it('devuelve 100% cuando está completa y limita el porcentaje máximo a 100%', async () => {
    const demandaRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: '3',
        origen: 'VENTAS',
        demandaExternaId: 'PED-303',
        estado: 'CONFIRMADA',
        fechaRequerida: '2026-12-20',
        items: [{ id: '20', productoCodigo: 'P-3', cantidad: '50.0000', unidad: 'kg' }],
      }),
    };
    const ordenRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 201,
          codigo: 'OP-201',
          producto_id: 3,
          estado: 'FINALIZADA',
          cantidad: 50,
          fecha_programada: '2026-12-18',
          creado_en: new Date('2026-11-22T08:00:00Z'),
        } as OrdenProduccion,
      ]),
    };
    const loteRepo = crearLoteRepoMock([{ ordenId: '201', totalProducido: '65.0000' }]);

    const service = new DemandaService(
      demandaRepo as any,
      ordenRepo as any,
      loteRepo as any,
    );
    const resultado = await service.obtenerCumplimiento('3');

    expect(resultado.cantidadPedida).toBe(50);
    expect(resultado.cantidadProducida).toBe(65);
    expect(resultado.porcentajeCumplido).toBe(100);
  });

  it('lanza NotFoundException (404) si la demanda no existe o el id no es numérico', async () => {
    const demandaRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new DemandaService(demandaRepo as any, {} as any, {} as any);

    await expect(service.obtenerCumplimiento('999')).rejects.toThrow(NotFoundException);
    await expect(service.obtenerCumplimiento('abc')).rejects.toThrow(NotFoundException);
  });
});
