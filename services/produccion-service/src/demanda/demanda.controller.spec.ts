import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { DemandaController, PERMISO_CONSULTAR_DEMANDAS } from './demanda.controller';
import { DemandaService } from './demanda.service';
import { ListarDemandasDto } from './dto/listar-demandas.dto';
import { Demanda } from './entities/demanda.entity';

describe('ABC-358: DemandaController y permisos', () => {
  it('exige PermisoProduccionGuard y el permiso ordenes.consultar', () => {
    const guards = Reflect.getMetadata('__guards__', DemandaController);
    expect(guards).toContain(PermisoProduccionGuard);

    const reflector = new Reflector();
    const permiso = reflector.get(PERMISO_PRODUCCION, DemandaController.prototype.listar);
    expect(permiso).toBe(PERMISO_CONSULTAR_DEMANDAS);
    expect(permiso).toBe('ordenes.consultar');
  });

  it('el controlador delega en DemandaService.listar', async () => {
    const mockResultado = {
      items: [
        {
          id: '1',
          origen: 'VENTAS' as const,
          demandaExternaId: 'PED-101',
          fechaRequerida: '2026-11-20',
          estado: 'RECIBIDA' as const,
          recibidaEn: '2026-11-06T00:00:00.000Z',
          confirmadaEn: null,
          items: [{ id: '10', productoCodigo: 'GAL-001', cantidad: '20.0000', unidad: 'kg' }],
          totalItems: 1,
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    const mockService = {
      listar: jest.fn().mockResolvedValue(mockResultado),
    } as unknown as DemandaService;

    const controller = new DemandaController(mockService);
    const dto: ListarDemandasDto = { page: 1, limit: 10 };
    const resultado = await controller.listar(dto);

    expect(mockService.listar).toHaveBeenCalledWith(dto);
    expect(resultado).toBe(mockResultado);
  });
});

describe('ABC-358: ListarDemandasDto validaciones', () => {
  it('acepta dto vacío con defaults válidos', async () => {
    const dto = plainToInstance(ListarDemandasDto, {});
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
  });

  it('acepta filtros válidos de origen VENTAS y estado RECIBIDA o CONFIRMADA', async () => {
    const dtoVentas = plainToInstance(ListarDemandasDto, { origen: 'VENTAS', estado: 'RECIBIDA', page: 2, limit: 20 });
    const erroresVentas = await validate(dtoVentas);
    expect(erroresVentas).toHaveLength(0);

    const dtoFacturacion = plainToInstance(ListarDemandasDto, { origen: 'FACTURACION', estado: 'CONFIRMADA' });
    const erroresFacturacion = await validate(dtoFacturacion);
    expect(erroresFacturacion).toHaveLength(0);
  });

  it('rechaza origen inválido', async () => {
    const dto = plainToInstance(ListarDemandasDto, { origen: 'OTRO' });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
    expect(errores[0].property).toBe('origen');
  });

  it('rechaza estado no soportado', async () => {
    const dto = plainToInstance(ListarDemandasDto, { estado: 'CANCELADA' });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
    expect(errores[0].property).toBe('estado');
  });

  it('rechaza página menor a 1 o límite mayor a 100', async () => {
    const dtoPagina = plainToInstance(ListarDemandasDto, { page: 0 });
    const erroresPagina = await validate(dtoPagina);
    expect(erroresPagina.some((e) => e.property === 'page')).toBe(true);

    const dtoLimite = plainToInstance(ListarDemandasDto, { limit: 101 });
    const erroresLimite = await validate(dtoLimite);
    expect(erroresLimite.some((e) => e.property === 'limit')).toBe(true);
  });
});

describe('ABC-358: DemandaService', () => {
  it('aplica filtros de origen, estado y paginación en el QueryBuilder', async () => {
    const demandasMock = [
      {
        id: '1',
        origen: 'VENTAS',
        demandaExternaId: 'PED-001',
        fechaRequerida: '2026-11-15',
        estado: 'RECIBIDA',
        recibidaEn: new Date('2026-11-06T10:00:00Z'),
        confirmadaEn: null,
        items: [
          { id: '1', productoCodigo: 'PAN-001', cantidad: '100.0000', unidad: 'unidad' },
        ],
      },
    ];

    const qbMock: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([demandasMock, 1]),
    };

    const repoMock: any = {
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    };

    const service = new DemandaService(repoMock);
    const resultado = await service.listar({ origen: 'VENTAS', estado: 'RECIBIDA', page: 2, limit: 5 });

    expect(repoMock.createQueryBuilder).toHaveBeenCalledWith('demanda');
    expect(qbMock.leftJoinAndSelect).toHaveBeenCalledWith('demanda.items', 'item');
    expect(qbMock.distinct).toHaveBeenCalledWith(true);
    expect(qbMock.andWhere).toHaveBeenCalledWith('demanda.origen = :origen', { origen: 'VENTAS' });
    expect(qbMock.andWhere).toHaveBeenCalledWith('demanda.estado = :estado', { estado: 'RECIBIDA' });
    expect(qbMock.skip).toHaveBeenCalledWith(5);
    expect(qbMock.take).toHaveBeenCalledWith(5);
    expect(resultado.total).toBe(1);
    expect(resultado.totalPages).toBe(1);
    expect(resultado.items[0].items).toHaveLength(1);
    expect(resultado.items[0].items[0].productoCodigo).toBe('PAN-001');
  });
});
