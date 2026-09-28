import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Auditoria } from './entities/auditoria.entity';

export interface EventoAuditoria {
  usuario_actor_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  usuario_afectado_id: string | null;
  datos_antes?: unknown | null;
  datos_despues?: unknown | null;
}

@Injectable()
export class AuditoriaService {
  constructor(@InjectRepository(Auditoria) private readonly registros: Repository<Auditoria>) {}

  // Únicamente otros servicios registran eventos; nunca desde una petición pública.
  async registrar(evento: EventoAuditoria, manager?: EntityManager): Promise<Auditoria> {
    const repositorio = manager?.getRepository(Auditoria) ?? this.registros;
    return repositorio.save(repositorio.create({
      ...evento,
      datos_antes: evento.datos_antes ?? null,
      datos_despues: evento.datos_despues ?? null,
    }));
  }

  findAll() {
    return this.registros.createQueryBuilder('a')
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
    const registro = await this.registros.findOneBy({ id });
    if (!registro) throw new NotFoundException('Registro de auditoría no encontrado');
    return registro;
  }
}
