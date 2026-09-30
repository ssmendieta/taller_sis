import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Auditoria } from './entities/auditoria.entity';
import { QueryAuditoriaDto } from './dto/query-auditoria.dto';

export interface RegistrarAuditoriaParams {
  usuarioId?: string | number | null;
  accion: string;
  entidad: string;
  entidadId?: string | number | null;
  usuarioAfectadoId?: string | number | null;
  datosAntes?: unknown;
  datosDespues?: unknown;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    @InjectRepository(Auditoria)
    private readonly repo: Repository<Auditoria>,
  ) {}

  // Lectura con nombres para la pantalla que aún consume el listado completo.
  findAll() {
    return this.repo.createQueryBuilder('a')
      .leftJoin('usuarios', 'actor', 'actor.id = a.usuario_actor_id')
      .leftJoin('usuarios', 'afectado', 'afectado.id = a.usuario_afectado_id')
      .select([
        'a.id AS id', 'a.usuario_actor_id AS usuario_actor_id',
        'a.accion AS accion', 'a.entidad AS entidad', 'a.entidad_id AS entidad_id',
        'a.usuario_afectado_id AS usuario_afectado_id', 'a.fecha_hora AS fecha_hora',
        'actor.nombre_completo AS usuario_actor_nombre',
        'afectado.nombre_completo AS usuario_afectado_nombre',
      ])
      .orderBy('a.fecha_hora', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .getRawMany();
  }

  async findOne(id: string): Promise<Auditoria> {
    const registro = await this.repo.findOneBy({ id });
    if (!registro) throw new NotFoundException('Registro de auditoría no encontrado');
    return registro;
  }

  async consultar(query: QueryAuditoriaDto) {
    const fechaHasta =
      query.fechaHasta !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(query.fechaHasta)
        ? `${query.fechaHasta}T23:59:59.999Z`
        : query.fechaHasta;

    if (
      query.fechaDesde !== undefined &&
      fechaHasta !== undefined &&
      new Date(query.fechaDesde).getTime() > new Date(fechaHasta).getTime()
    ) {
      throw new BadRequestException('fechaDesde no puede ser posterior a fechaHasta');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const base = this.repo
      .createQueryBuilder('a')
      .leftJoin('usuarios', 'actor', 'actor.id = a.usuario_actor_id')
      .leftJoin('usuarios', 'afectado', 'afectado.id = a.usuario_afectado_id');

    if (query.usuario !== undefined) {
      base.andWhere(
        '(a.usuario_actor_id = :usuario OR a.usuario_afectado_id = :usuario)',
        { usuario: query.usuario },
      );
    }
    if (query.usuario_actor_id !== undefined) {
      base.andWhere('a.usuario_actor_id = :usuario_actor_id', {
        usuario_actor_id: query.usuario_actor_id,
      });
    }
    if (query.usuario_afectado_id !== undefined) {
      base.andWhere('a.usuario_afectado_id = :usuario_afectado_id', {
        usuario_afectado_id: query.usuario_afectado_id,
      });
    }
    if (query.accion !== undefined) {
      base.andWhere('a.accion = :accion', { accion: query.accion });
    }
    if (query.entidad !== undefined) {
      base.andWhere('a.entidad = :entidad', { entidad: query.entidad });
    }
    if (query.entidad_id !== undefined) {
      base.andWhere('a.entidad_id = :entidad_id', {
        entidad_id: query.entidad_id,
      });
    }
    if (query.fechaDesde !== undefined) {
      base.andWhere('a.fecha_hora >= :fechaDesde', {
        fechaDesde: query.fechaDesde,
      });
    }
    if (query.fechaHasta !== undefined) {
      base.andWhere('a.fecha_hora <= :fechaHasta', {
        fechaHasta,
      });
    }

    const total = await base.getCount();
    const items = await base
      .clone()
      .select([
        'a.id AS id',
        'a.usuario_actor_id AS usuario_actor_id',
        'a.accion AS accion',
        'a.entidad AS entidad',
        'a.entidad_id AS entidad_id',
        'a.usuario_afectado_id AS usuario_afectado_id',
        'a.datos_antes AS datos_antes',
        'a.datos_despues AS datos_despues',
        'a.fecha_hora AS fecha_hora',
        'actor.nombre_completo AS usuario_actor_nombre',
        'afectado.nombre_completo AS usuario_afectado_nombre',
      ])
      .orderBy('a.fecha_hora', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async registrar(
    params: RegistrarAuditoriaParams,
    manager?: EntityManager,
  ): Promise<Auditoria> {
    try {
      const repo = manager?.getRepository(Auditoria) ?? this.repo;
      const registro = repo.create({
        usuario_actor_id:
          params.usuarioId !== undefined && params.usuarioId !== null
            ? String(params.usuarioId)
            : null,

        accion: params.accion,
        entidad: params.entidad,

        entidad_id:
          params.entidadId !== undefined && params.entidadId !== null
            ? String(params.entidadId)
            : null,

        usuario_afectado_id:
          params.usuarioAfectadoId !== undefined &&
          params.usuarioAfectadoId !== null
            ? String(params.usuarioAfectadoId)
            : null,

        datos_antes: params.datosAntes ?? null,
        datos_despues: params.datosDespues ?? null,
      });

      return await repo.save(registro);
    } catch (error) {
      this.logger.error(
        `Error registrando auditoría para acción ${params.accion}: ${
          (error as Error).message
        }`,
        (error as Error).stack,
      );

      throw error;
    }
  }
}
