import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DemandaRegistradaV1Event } from '../integraciones/contratos/ventas-demanda-v1';
import {
  EventoDemandaV1InvalidoError,
  validarSobreDemandaV1,
} from '../integraciones/contratos/ventas-demanda-v1.validator';
import { ESTADO_INBOX_PROCESADO, EventoInbox } from '../integraciones/inbox/entities/evento-inbox.entity';
import { DemandaItem } from './entities/demanda-item.entity';
import { Demanda, ESTADO_DEMANDA_RECIBIDA } from './entities/demanda.entity';

export type ResultadoProcesamientoDemanda = 'PROCESADO' | 'DUPLICADO';

export interface DemandaProcesada {
  resultado: ResultadoProcesamientoDemanda;
  eventId: string;
  demandaId: string;
}

export class ConflictoEventoDemandaError extends Error {
  constructor(readonly eventId: string) {
    super(`El eventId ${eventId} ya fue recibido con contenido diferente`);
    this.name = 'ConflictoEventoDemandaError';
  }
}

function ordenar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenar);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = ordenar((value as Record<string, unknown>)[key]);
      return result;
    }, {});
  }
  return value;
}

export function hashContenido(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(ordenar(value))).digest('hex');
}

/** Errores que no se arreglan reintentando: se confirman (ACK) para no bloquear la suscripción. */
export function esErrorPermanenteDemanda(error: unknown): boolean {
  return error instanceof SyntaxError
    || error instanceof EventoDemandaV1InvalidoError
    || error instanceof ConflictoEventoDemandaError;
}

function esViolacionUnica(error: unknown, constraint: string): boolean {
  const db = (error as { driverError?: { code?: string; constraint?: string } })?.driverError ?? error;
  return (db as { code?: string })?.code === '23505' && (db as { constraint?: string })?.constraint === constraint;
}

// ABC-356: persiste la demanda y su registro de inbox en una sola transacción.
@Injectable()
export class ProcesadorDemandaService {
  constructor(private readonly dataSource: DataSource) {}

  async procesar(payload: unknown, messageId?: string): Promise<DemandaProcesada> {
    const evento = this.validar(payload);
    const payloadHash = hashContenido(evento);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const previo = await this.duplicadoPorEvento(manager, evento, payloadHash);
        if (previo) return previo;
        return this.registrar(manager, evento, payloadHash, messageId);
      });
    } catch (error) {
      // Dos entregas simultáneas del mismo evento: la segunda choca con la unicidad del inbox.
      if (esViolacionUnica(error, 'uq_eventos_inbox_event_id')) {
        const previo = await this.duplicadoPorEvento(this.dataSource.manager, evento, payloadHash);
        if (previo) return previo;
      }
      throw error;
    }
  }

  protected validar(payload: unknown): DemandaRegistradaV1Event {
    return validarSobreDemandaV1(payload);
  }

  private async duplicadoPorEvento(
    manager: EntityManager,
    evento: DemandaRegistradaV1Event,
    payloadHash: string,
  ): Promise<DemandaProcesada | null> {
    const previo = await manager.findOne(EventoInbox, { where: { eventId: evento.eventId } });
    if (!previo) return null;
    if (previo.payloadHash !== payloadHash) throw new ConflictoEventoDemandaError(evento.eventId);
    const demanda = await manager.findOne(Demanda, {
      where: { origen: evento.data.origen, demandaExternaId: evento.data.demandaExternaId.trim() },
    });
    return { resultado: 'DUPLICADO', eventId: evento.eventId, demandaId: demanda?.id ?? '' };
  }

  protected async registrar(
    manager: EntityManager,
    evento: DemandaRegistradaV1Event,
    payloadHash: string,
    messageId?: string,
  ): Promise<DemandaProcesada> {
    const demanda = await manager.save(Demanda, manager.create(Demanda, {
      origen: evento.data.origen,
      demandaExternaId: evento.data.demandaExternaId.trim(),
      fechaRequerida: evento.data.fechaRequerida,
      estado: ESTADO_DEMANDA_RECIBIDA,
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      contenidoHash: hashContenido(evento.data),
    }));
    await manager.save(DemandaItem, evento.data.items.map((item) => manager.create(DemandaItem, {
      demandaId: demanda.id,
      productoCodigo: item.productoCodigo.trim(),
      cantidad: item.cantidad,
      unidad: item.unidad.trim(),
    })));
    await this.guardarInbox(manager, evento, payloadHash, messageId, null);
    return { resultado: 'PROCESADO', eventId: evento.eventId, demandaId: demanda.id };
  }

  protected async guardarInbox(
    manager: EntityManager,
    evento: DemandaRegistradaV1Event,
    payloadHash: string,
    messageId: string | undefined,
    detalle: string | null,
  ): Promise<void> {
    await manager.save(EventoInbox, {
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      eventType: evento.eventType,
      payloadHash,
      payload: evento,
      estado: ESTADO_INBOX_PROCESADO,
      messageId: messageId ?? null,
      detalle,
      procesadoEn: new Date(),
    });
  }
}
