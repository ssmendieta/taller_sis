import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EstadoOutbox, EventoOutbox } from './outbox/entities/evento-outbox.entity';
import { PUBSUB_LOGISTICA_CONFIG, PubSubLogisticaConfig } from './pubsub/pubsub-logistica.config';

const ESTADOS: EstadoOutbox[] = ['PENDIENTE', 'PROCESANDO', 'PUBLICADO'];

// ABC-388: consulta de eventos de Logística hacia Inventarios y reintento autorizado.
// Mismo contrato de respuesta que /api/produccion/integraciones/eventos (ABC-267).
@Injectable()
export class IntegracionesLogisticaService {
  constructor(
    private readonly source: DataSource,
    @Inject(PUBSUB_LOGISTICA_CONFIG) private readonly config: PubSubLogisticaConfig,
  ) {}

  async listar(query: Record<string, unknown>) {
    const page = this.entero(query.page, 1, 1000000);
    const limit = this.entero(query.limit, 20, 100);
    const estado = query.estado;
    if (estado !== undefined && !ESTADOS.includes(estado as EstadoOutbox)) throw new BadRequestException('Estado inválido');
    const [eventos, total] = await this.source.getRepository(EventoOutbox).findAndCount({
      where: estado ? { estado: estado as EstadoOutbox } : {},
      order: { creadoEn: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: eventos.map((evento) => this.resumen(evento)), total, page, limit };
  }

  // Adelanta el próximo intento del MISMO evento: no cambia eventId, cuerpo ni contador.
  async reintentar(id: string) {
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt('9223372036854775807')) {
      throw new BadRequestException('Identificador inválido');
    }
    return this.source.transaction(async (manager) => {
      const repository = manager.getRepository(EventoOutbox);
      const evento = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!evento) throw new NotFoundException('Evento no encontrado');
      const ahora = new Date();
      if (!this.puedeReintentar(evento, ahora)) {
        throw new ConflictException('El evento ya fue publicado o está siendo procesado');
      }
      evento.estado = 'PENDIENTE';
      evento.proximoIntentoEn = new Date(Math.min(evento.proximoIntentoEn.getTime(), ahora.getTime()));
      evento.bloqueoToken = null;
      evento.bloqueoHasta = null;
      await repository.save(evento);
      return { mensaje: 'Reintento programado', evento: this.resumen(evento) };
    });
  }

  private puedeReintentar(evento: EventoOutbox, ahora = new Date()) {
    return evento.estado === 'PENDIENTE' ||
      (evento.estado === 'PROCESANDO' && evento.bloqueoHasta !== null && evento.bloqueoHasta <= ahora);
  }

  private resumen(evento: EventoOutbox) {
    return {
      id: evento.id,
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      eventType: evento.eventType,
      agregado: { tipo: evento.aggregateType, id: evento.aggregateId },
      destinoConfigurado: this.config.publicacion.topicId || null,
      publicadorHabilitado: this.config.publicacion.enabled,
      estado: evento.estado,
      intentos: evento.intentos,
      ultimoError: evento.ultimoError?.slice(0, 500) ?? null,
      creadoEn: evento.creadoEn,
      ultimoIntentoEn: evento.ultimoIntentoEn,
      proximoIntentoEn: evento.proximoIntentoEn,
      publicadoEn: evento.publicadoEn,
      messageId: evento.messageId,
      puedeReintentar: this.puedeReintentar(evento),
    };
  }

  private entero(value: unknown, defecto: number, max: number) {
    if (value === undefined) return defecto;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) {
      throw new BadRequestException('Paginación inválida');
    }
    return Number(value);
  }
}
