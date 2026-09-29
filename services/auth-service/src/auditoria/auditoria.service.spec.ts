import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { AuditoriaService } from './auditoria.service';
import { Auditoria } from './entities/auditoria.entity';
import { QueryAuditoriaDto } from './dto/query-auditoria.dto';

interface QueryBuilderProbe {
  andWhere(condition: string, parameters?: Record<string, string>): QueryBuilderProbe;
  orderBy(property: string, direction: 'ASC' | 'DESC'): QueryBuilderProbe;
  addOrderBy(property: string, direction: 'ASC' | 'DESC'): QueryBuilderProbe;
  skip(count: number): QueryBuilderProbe;
  take(count: number): QueryBuilderProbe;
  getManyAndCount(): Promise<[Auditoria[], number]>;
}

function consultaService(items: Auditoria[] = [], total = items.length) {
  const conditions: Array<{ condition: string; parameters?: Record<string, string> }> = [];
  const orderings: Array<{ property: string; direction: 'ASC' | 'DESC' }> = [];
  const aliases: string[] = [];
  const pagination = { skip: -1, take: -1 };
  let executed = 0;

  let queryBuilder: QueryBuilderProbe;
  queryBuilder = {
    andWhere(condition, parameters) {
      conditions.push({ condition, parameters });
      return queryBuilder;
    },
    orderBy(property, direction) {
      orderings.push({ property, direction });
      return queryBuilder;
    },
    addOrderBy(property, direction) {
      orderings.push({ property, direction });
      return queryBuilder;
    },
    skip(count) {
      pagination.skip = count;
      return queryBuilder;
    },
    take(count) {
      pagination.take = count;
      return queryBuilder;
    },
    async getManyAndCount() {
      executed += 1;
      return [items, total];
    },
  };

  const repository = {
    createQueryBuilder(alias: string) {
      aliases.push(alias);
      return queryBuilder;
    },
  };

  return {
    service: new AuditoriaService(repository as unknown as Repository<Auditoria>),
    conditions,
    orderings,
    aliases,
    pagination,
    executionCount: () => executed,
  };
}

function eventoAuditoria(): Auditoria {
  return {
    id: '15',
    usuario_actor_id: '8',
    accion: 'CAMBIO_ESTADO',
    entidad: 'USUARIO',
    entidad_id: '21',
    usuario_afectado_id: '21',
    datos_antes: { activo: true },
    datos_despues: { activo: false },
    fecha_hora: new Date('2026-09-01T10:00:00.000Z'),
  };
}

describe('AuditoriaService', () => {
  let service: AuditoriaService;

  const mockAuditoriaRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entity: Partial<Auditoria>) =>
      Promise.resolve({
        id: '1',
        ...entity,
        fecha_hora: new Date(),
      }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditoriaService,
        {
          provide: getRepositoryToken(Auditoria),
          useValue: mockAuditoriaRepo,
        },
      ],
    }).compile();

    service = module.get<AuditoriaService>(AuditoriaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe registrar un evento de auditoria correctamente', async () => {
    const fechaHora = new Date();
    const params = {
      usuarioId: '10',
      accion: 'CREACION_USUARIO',
      entidad: 'USUARIO',
      entidadId: '20',
      usuarioAfectadoId: '20',
      datosDespues: { correo: 'test@example.com' },
    };

    const resultado = await service.registrar(params);

    expect(mockAuditoriaRepo.create).toHaveBeenCalled();
    expect(mockAuditoriaRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      usuario_actor_id: '10',
      accion: 'CREACION_USUARIO',
      entidad: 'USUARIO',
      entidad_id: '20',
      usuario_afectado_id: '20',
      datos_antes: null,
      datos_despues: { correo: 'test@example.com' },
    }));
    expect(mockAuditoriaRepo.save).toHaveBeenCalled();
    expect(resultado.usuario_actor_id).toBe('10');
    expect(resultado.accion).toBe('CREACION_USUARIO');
    expect(resultado.entidad_id).toBe('20');
    expect(resultado.usuario_afectado_id).toBe('20');
    expect(resultado.fecha_hora).toBeInstanceOf(Date);
    expect(resultado.fecha_hora.getTime()).toBeGreaterThan(0);
    expect(fechaHora.getTime()).toBeGreaterThan(0);
  });

  it('usa el repositorio de la transacción para guardar el evento', async () => {
    const transactionRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity: Partial<Auditoria>) => entity),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(transactionRepo),
    };

    await service.registrar({
      usuarioId: '10',
      accion: 'CAMBIO_ESTADO',
      entidad: 'USUARIO',
      entidadId: '20',
      usuarioAfectadoId: '20',
    }, manager as any);

    expect(manager.getRepository).toHaveBeenCalledWith(Auditoria);
    expect(transactionRepo.save).toHaveBeenCalled();
    expect(mockAuditoriaRepo.save).not.toHaveBeenCalled();
  });
});

describe('AuditoriaService.consultar (ABC-184)', () => {
  it('consulta sin filtros y aplica paginación predeterminada', async () => {
    const evento = eventoAuditoria();
    const probe = consultaService([evento], 1);

    const resultado = await probe.service.consultar(new QueryAuditoriaDto());

    expect(probe.aliases).toEqual(['auditoria']);
    expect(probe.conditions).toHaveLength(0);
    expect(probe.pagination).toEqual({ skip: 0, take: 20 });
    expect(probe.executionCount()).toBe(1);
    expect(resultado).toEqual({
      items: [evento],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('calcula skip/take para la página solicitada', async () => {
    const probe = consultaService([], 45);
    const query = new QueryAuditoriaDto();
    query.page = 3;
    query.limit = 10;

    const resultado = await probe.service.consultar(query);

    expect(probe.pagination).toEqual({ skip: 20, take: 10 });
    expect(resultado).toMatchObject({ page: 3, limit: 10, totalPages: 5 });
  });

  it('filtra por usuario_actor_id conservándolo como string', async () => {
    const probe = consultaService();
    const query = new QueryAuditoriaDto();
    query.usuario_actor_id = '9007199254740993';

    await probe.service.consultar(query);

    expect(probe.conditions).toContainEqual({
      condition: 'auditoria.usuario_actor_id = :usuario_actor_id',
      parameters: { usuario_actor_id: '9007199254740993' },
    });
  });

  it('filtra por acción exacta', async () => {
    const probe = consultaService();
    const query = new QueryAuditoriaDto();
    query.accion = 'CAMBIO_ESTADO';

    await probe.service.consultar(query);

    expect(probe.conditions).toContainEqual({
      condition: 'auditoria.accion = :accion',
      parameters: { accion: 'CAMBIO_ESTADO' },
    });
  });

  it('filtra por entidad', async () => {
    const probe = consultaService();
    const query = new QueryAuditoriaDto();
    query.entidad = 'USUARIO';

    await probe.service.consultar(query);

    expect(probe.conditions).toContainEqual({
      condition: 'auditoria.entidad = :entidad',
      parameters: { entidad: 'USUARIO' },
    });
  });

  it('filtra por entidad_id', async () => {
    const probe = consultaService();
    const query = new QueryAuditoriaDto();
    query.entidad_id = '21';

    await probe.service.consultar(query);

    expect(probe.conditions).toContainEqual({
      condition: 'auditoria.entidad_id = :entidad_id',
      parameters: { entidad_id: '21' },
    });
  });

  it('aplica ambos límites del rango de fechas', async () => {
    const probe = consultaService();
    const query = new QueryAuditoriaDto();
    query.fechaDesde = '2026-09-01T00:00:00.000Z';
    query.fechaHasta = '2026-09-30T23:59:59.999Z';

    await probe.service.consultar(query);

    expect(probe.conditions).toContainEqual({
      condition: 'auditoria.fecha_hora >= :fechaDesde',
      parameters: { fechaDesde: query.fechaDesde },
    });
    expect(probe.conditions).toContainEqual({
      condition: 'auditoria.fecha_hora <= :fechaHasta',
      parameters: { fechaHasta: query.fechaHasta },
    });
  });

  it('incluye el día completo cuando fechaHasta no especifica hora', async () => {
    const probe = consultaService();
    const query = new QueryAuditoriaDto();
    query.fechaHasta = '2026-09-30';

    await probe.service.consultar(query);

    expect(probe.conditions).toContainEqual({
      condition: 'auditoria.fecha_hora <= :fechaHasta',
      parameters: { fechaHasta: '2026-09-30T23:59:59.999Z' },
    });
  });

  it('combina todos los filtros enviados y omite los que no se enviaron', async () => {
    const probe = consultaService();
    const query = new QueryAuditoriaDto();
    query.usuario_actor_id = '8';
    query.accion = 'CAMBIO_ESTADO';
    query.entidad = 'USUARIO';
    query.entidad_id = '21';
    query.fechaDesde = '2026-09-01T00:00:00.000Z';
    query.fechaHasta = '2026-09-30T23:59:59.999Z';

    await probe.service.consultar(query);

    expect(probe.conditions).toHaveLength(6);
    expect(probe.conditions.map(({ condition }) => condition)).toEqual([
      'auditoria.usuario_actor_id = :usuario_actor_id',
      'auditoria.accion = :accion',
      'auditoria.entidad = :entidad',
      'auditoria.entidad_id = :entidad_id',
      'auditoria.fecha_hora >= :fechaDesde',
      'auditoria.fecha_hora <= :fechaHasta',
    ]);
  });

  it('ordena por fecha descendente y usa id descendente para desempatar', async () => {
    const probe = consultaService();

    await probe.service.consultar(new QueryAuditoriaDto());

    expect(probe.orderings).toEqual([
      { property: 'auditoria.fecha_hora', direction: 'DESC' },
      { property: 'auditoria.id', direction: 'DESC' },
    ]);
  });

  it('calcula totalPages correctamente y devuelve los metadatos', async () => {
    const probe = consultaService([eventoAuditoria()], 41);
    const query = new QueryAuditoriaDto();
    query.limit = 20;

    const resultado = await probe.service.consultar(query);

    expect(resultado).toEqual({
      items: [eventoAuditoria()],
      total: 41,
      page: 1,
      limit: 20,
      totalPages: 3,
    });
  });

  it('rechaza un rango invertido antes de consultar el repositorio', async () => {
    const probe = consultaService();
    const query = new QueryAuditoriaDto();
    query.fechaDesde = '2026-10-01T00:00:00.000Z';
    query.fechaHasta = '2026-09-01T00:00:00.000Z';

    await expect(probe.service.consultar(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(probe.aliases).toHaveLength(0);
  });

  it('valida límites de paginación, usuario BIGINT y fechas del DTO', async () => {
    const dto = plainToInstance(QueryAuditoriaDto, {
      page: '0',
      limit: '101',
      usuario_actor_id: '8 OR 1=1',
      fechaDesde: 'ayer',
    });

    const errors = await validate(dto);
    const invalidProperties = errors.map(({ property }) => property);

    expect(invalidProperties).toEqual(
      expect.arrayContaining(['page', 'limit', 'usuario_actor_id', 'fechaDesde']),
    );
  });

  it('usa valores predeterminados cuando no se proporcionan page ni limit', () => {
    const dto = plainToInstance(QueryAuditoriaDto, {});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });
});
