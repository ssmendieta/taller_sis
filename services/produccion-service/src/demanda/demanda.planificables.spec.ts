import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';
import { DemandaController, PERMISO_CONSULTAR_DEMANDAS } from './demanda.controller';
import { DemandaService } from './demanda.service';
import { ListarDemandasPlanificablesDto } from './dto/listar-demandas-planificables.dto';

function crearQueryBuilder(resultado: any[] = [], total = resultado.length) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([resultado, total]),
  };
}

const confirmada = {
  id: '21',
  origen: 'VENTAS',
  demandaExternaId: 'PED-ABC-366',
  fechaRequerida: '2026-11-20',
  estado: 'CONFIRMADA',
  recibidaEn: new Date('2026-11-06T10:00:00Z'),
  confirmadaEn: new Date('2026-11-07T10:00:00Z'),
  items: [
    { id: '91', productoCodigo: 'PROD-1', cantidad: '10.0000', unidad: 'unidad' },
    { id: '92', productoCodigo: 'PROD-2', cantidad: '5.0000', unidad: 'kg' },
  ],
};

describe('ABC-366: endpoint de demandas planificables', () => {
  it('protege el endpoint con el permiso de consulta de producción', () => {
    const reflector = new Reflector();
    const permiso = reflector.get(
      PERMISO_PRODUCCION,
      DemandaController.prototype.listarPlanificables,
    );
    expect(permiso).toBe(PERMISO_CONSULTAR_DEMANDAS);
    expect(permiso).toBe('ordenes.consultar');
  });

  it('delega la consulta paginada al servicio especializado', async () => {
    const resultado = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
    const servicio = {
      listarPlanificables: jest.fn().mockResolvedValue(resultado),
    } as unknown as DemandaService;
    const controller = new DemandaController(servicio);
    const dto = { origen: 'VENTAS', page: 2, limit: 5 } as ListarDemandasPlanificablesDto;

    await expect(controller.listarPlanificables(dto)).resolves.toBe(resultado);
    expect(servicio.listarPlanificables).toHaveBeenCalledWith(dto);
  });

  it('rechaza el parámetro estado para que el cliente no pueda pedir RECIBIDA', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { estado: 'RECIBIDA', page: '1', limit: '10' },
        { type: 'query', metatype: ListarDemandasPlanificablesDto, data: '' },
      ),
    ).rejects.toThrow();
  });
});

describe('ABC-366: consulta exclusiva y sin efectos secundarios', () => {
  it('fuerza CONFIRMADA, aplica origen y paginación, y elimina duplicados del JOIN', async () => {
    const qb = crearQueryBuilder([confirmada], 1);
    const repositorio = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const servicio = new DemandaService(repositorio as any);

    const resultado = await servicio.listarPlanificables({
      origen: 'VENTAS',
      page: 2,
      limit: 5,
      estado: 'RECIBIDA',
    } as any);

    expect(qb.andWhere).toHaveBeenCalledWith('demanda.origen = :origen', {
      origen: 'VENTAS',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('demanda.estado = :estado', {
      estado: 'CONFIRMADA',
    });
    expect(qb.distinct).toHaveBeenCalledWith(true);
    expect(qb.orderBy).toHaveBeenCalledWith('demanda.confirmadaEn', 'DESC');
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(resultado).toMatchObject({ total: 1, page: 2, limit: 5, totalPages: 1 });
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]).toMatchObject({
      demandaExternaId: 'PED-ABC-366',
      estado: 'CONFIRMADA',
      totalItems: 2,
    });
  });

  it('es de solo lectura: no guarda demandas ni crea órdenes al consultar', async () => {
    const qb = crearQueryBuilder([confirmada], 1);
    const repositorio = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      save: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const servicio = new DemandaService(repositorio as any);

    await servicio.listarPlanificables({ page: 1, limit: 10 });

    expect(repositorio.save).not.toHaveBeenCalled();
    expect(repositorio.insert).not.toHaveBeenCalled();
    expect(repositorio.update).not.toHaveBeenCalled();
  });
});
