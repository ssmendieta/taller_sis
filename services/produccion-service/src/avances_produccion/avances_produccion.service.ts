import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { EstadoOrden } from '../ordenes/estado-orden.enum';
import type { UsuarioAutenticadoProduccion } from '../ordenes/ordenes.service';
import { AvancesProduccion } from './entities/avances_produccion.entity';
import { CreateAvancesProduccionDto } from './dto/create-avances_produccion.dto';

export interface RegistroAvanceResponse {
  avance: AvancesProduccion;
  cantidad_solicitada: number;
  cantidad_producida_acumulada: number;
  cantidad_pendiente: number;
}

function aUnidadesEscaladas(valor: number | string): number {
  const texto = typeof valor === 'number' ? valor.toFixed(4) : valor;
  const partes = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(texto);

  if (!partes) {
    throw new Error('Valor NUMERIC inválido al calcular avance de producción.');
  }

  const magnitud =
    Number(partes[2]) * 10_000 + Number((partes[3] ?? '').padEnd(4, '0'));
  return partes[1] === '-' ? -magnitud : magnitud;
}

@Injectable()
export class AvancesProduccionService {
  constructor(
    @InjectRepository(OrdenProduccion)
    private readonly ordenRepository: Repository<OrdenProduccion>,
  ) {}

  async create(
    dto: CreateAvancesProduccionDto,
    usuarioAutenticado?: UsuarioAutenticadoProduccion,
  ): Promise<RegistroAvanceResponse> {
    if (!usuarioAutenticado) {
      throw new UnauthorizedException(
        'Debe iniciar sesión para registrar avances.',
      );
    }

    const usuarioId = String(usuarioAutenticado.sub);
    if (!/^[1-9]\d*$/.test(usuarioId)) {
      throw new UnauthorizedException(
        'La identidad autenticada no contiene un ID de usuario válido.',
      );
    }

    if (!Number.isFinite(dto.cantidad_producida) || dto.cantidad_producida <= 0) {
      throw new BadRequestException('La cantidad producida debe ser mayor a cero.');
    }

    if (Number(dto.cantidad_producida.toFixed(4)) !== dto.cantidad_producida) {
      throw new BadRequestException(
        'La cantidad producida admite como máximo cuatro decimales.',
      );
    }

    return this.ordenRepository.manager.transaction(async (manager) =>
      this.registrarEnTransaccion(
        manager,
        dto,
        usuarioId,
        typeof usuarioAutenticado.nombre === 'string' && usuarioAutenticado.nombre.trim()
          ? usuarioAutenticado.nombre.trim()
          : `Usuario #${usuarioId}`,
      ),
    );
  }

  private async registrarEnTransaccion(
    manager: EntityManager,
    dto: CreateAvancesProduccionDto,
    usuarioId: string,
    usuarioNombre: string,
  ): Promise<RegistroAvanceResponse> {
    const orden = await manager.findOne(OrdenProduccion, {
      where: { id: dto.orden_id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!orden) {
      throw new NotFoundException(`Orden ${dto.orden_id} no encontrada`);
    }

    if (orden.estado !== EstadoOrden.EN_PRODUCCION) {
      throw new ConflictException(
        `No se puede registrar avance: la orden debe estar en '${EstadoOrden.EN_PRODUCCION}'.`,
      );
    }

    const filasAcumulado = (await manager.query(
      `SELECT COALESCE(SUM(cantidad_producida), 0) AS acumulado
       FROM avances_produccion
       WHERE orden_id = $1`,
      [orden.id],
    )) as Array<{ acumulado: string | number }>;
    const acumuladoUnidades = aUnidadesEscaladas(
      filasAcumulado[0]?.acumulado ?? 0,
    );
    const nuevaCantidadUnidades = aUnidadesEscaladas(dto.cantidad_producida);
    const cantidadSolicitadaUnidades = aUnidadesEscaladas(orden.cantidad);
    const nuevoAcumuladoUnidades = acumuladoUnidades + nuevaCantidadUnidades;
    const acumulado = acumuladoUnidades / 10_000;
    const cantidadSolicitada = cantidadSolicitadaUnidades / 10_000;

    if (nuevoAcumuladoUnidades > cantidadSolicitadaUnidades) {
      throw new ConflictException({
        message: 'El avance excede la cantidad solicitada para la orden.',
        orden_id: orden.id,
        cantidad_solicitada: cantidadSolicitada,
        cantidad_producida_acumulada: acumulado,
        cantidad_nueva: dto.cantidad_producida,
      });
    }

    const avance = await manager.save(AvancesProduccion, {
      orden_id: String(orden.id),
      cantidad_producida: dto.cantidad_producida,
      usuario_responsable_id: usuarioId,
      usuario_responsable_nombre: usuarioNombre,
    });
    const cantidadProducidaAcumulada = nuevoAcumuladoUnidades / 10_000;
    const cantidadPendiente =
      (cantidadSolicitadaUnidades - nuevoAcumuladoUnidades) / 10_000;

    return {
      avance,
      cantidad_solicitada: cantidadSolicitada,
      cantidad_producida_acumulada: cantidadProducidaAcumulada,
      cantidad_pendiente: cantidadPendiente,
    };
  }

  findAll() {
    return this.ordenRepository.manager.query(`
      SELECT id::text AS id, orden_id::text AS orden_id,
             cantidad_producida::text AS cantidad_producida, fecha_hora,
             usuario_responsable_id::text AS usuario_responsable_id,
             COALESCE(usuario_responsable_nombre, 'Usuario #' || usuario_responsable_id) AS usuario_responsable_nombre
      FROM avances_produccion ORDER BY fecha_hora DESC, id DESC
    `);
  }

  async findOne(id: number) {
    const [avance] = await this.ordenRepository.manager.query(
      `
      SELECT id::text AS id, orden_id::text AS orden_id,
             cantidad_producida::text AS cantidad_producida, fecha_hora,
             usuario_responsable_id::text AS usuario_responsable_id,
             COALESCE(usuario_responsable_nombre, 'Usuario #' || usuario_responsable_id) AS usuario_responsable_nombre
      FROM avances_produccion WHERE id = $1
    `,
      [id],
    );
    if (!avance) throw new NotFoundException('Avance no encontrado');
    return avance;
  }

  // Avances de una orden (aporte de ramagemina, ABC-195/ABC-196).
  listarPorOrden(ordenId: number) {
    return this.ordenRepository.manager.query(
      `
      SELECT id::text AS id, orden_id::text AS orden_id,
             cantidad_producida::text AS cantidad_producida, fecha_hora,
             usuario_responsable_id::text AS usuario_responsable_id,
             COALESCE(usuario_responsable_nombre, 'Usuario #' || usuario_responsable_id) AS usuario_responsable_nombre
      FROM avances_produccion
      WHERE orden_id = $1
      ORDER BY fecha_hora DESC, id DESC
    `,
      [ordenId],
    );
  }

  // Total producido de una orden (aporte de ramagemina, ABC-195/ABC-196).
  async totalProducido(ordenId: number) {
    const [fila] = (await this.ordenRepository.manager.query(
      `
      SELECT COALESCE(SUM(cantidad_producida), 0) AS total
      FROM avances_produccion
      WHERE orden_id = $1
    `,
      [ordenId],
    )) as Array<{ total: string | number }>;

    return Number(fila?.total ?? 0);
  }
}
