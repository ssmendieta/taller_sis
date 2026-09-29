import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Auditoria } from './entities/auditoria.entity';

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
