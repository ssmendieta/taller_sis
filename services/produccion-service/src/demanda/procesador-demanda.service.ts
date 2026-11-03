import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DemandaRegistradaV1Event } from '../integraciones/contratos/ventas-demanda-v1';
import {
  EventoDemandaV1InvalidoError,
  validarSobreDemandaV1,
} from '../integraciones/contratos/ventas-demanda-v1.validator';
import {
  ESTADO_INBOX_IGNORADO,
  ESTADO_INBOX_PROCESADO,
  EstadoInbox,
  EventoInbox,
} from '../integraciones/inbox/entities/evento-inbox.entity';
import { DemandaItem } from './entities/demanda-item.entity';
import { DemandaRechazada, MotivoRechazoDemanda } from './entities/demanda-rechazada.entity';
import { Demanda, ESTADO_DEMANDA_RECIBIDA } from './entities/demanda.entity';
import { validarDemandaRegistradaV1 } from './validar-demanda';

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

// ABC-357: misma demanda externa (origen + id) con contenido de negocio distinto.
export class ConflictoDemandaContradictoriaError extends Error {
  constructor(readonly origen: string, readonly demandaExternaId: string, readonly demandaId: string) {
    super(`La demanda ${origen}/${demandaExternaId} ya existe (id ${demandaId}) con contenido diferente`);
    this.name = 'ConflictoDemandaContradictoriaError';
  }
}

/** Errores que no se arreglan reintentando: se confirman (ACK) para no bloquear la suscripción. */
export function esErrorPermanenteDemanda(error: unknown): boolean {
  return error instanceof SyntaxError
    || error instanceof EventoDemandaV1InvalidoError
    || error instanceof ConflictoEventoDemandaError
    || error instanceof ConflictoDemandaContradictoriaError;
}

function motivoRechazo(error: unknown): MotivoRechazoDemanda {
  if (error instanceof ConflictoDemandaContradictoriaError) return 'DEMANDA_CONTRADICTORIA';
  if (error instanceof ConflictoEventoDemandaError) return 'EVENTO_CONTRADICTORIO';
  return 'EVENTO_INVALIDO';
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
    try {
      const evento = this.validar(payload);
      return await this.procesarValidado(evento, hashContenido(evento), messageId);
    } catch (error) {
      if (esErrorPermanenteDemanda(error)) await this.registrarRechazo(payload, error, messageId);
      throw error;
    }
  }

  private async procesarValidado(
    evento: DemandaRegistradaV1Event,
    payloadHash: string,
    messageId?: string,
  ): Promise<DemandaProcesada> {
    // Si dos entregas compiten, la perdedora choca con una restricción única y se reintenta
    // una vez: en el segundo intento ya ve el registro ganador y responde como duplicado.
    for (let intento = 1; ; intento += 1) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          const previo = await this.duplicadoPorEvento(manager, evento, payloadHash);
          if (previo) return previo;
          return this.registrar(manager, evento, payloadHash, messageId);
        });
      } catch (error) {
        const carrera = esViolacionUnica(error, 'uq_eventos_inbox_event_id')
          || esViolacionUnica(error, 'uq_demanda_origen_externa');
        if (!carrera || intento >= 2) throw error;
      }
    }
  }

  protected validar(payload: unknown): DemandaRegistradaV1Event {
    return validarDemandaRegistradaV1(validarSobreDemandaV1(payload));
  }

  // Se guarda fuera de la transacción fallida para que el motivo quede trazado.
  private async registrarRechazo(payload: unknown, error: unknown, messageId?: string): Promise<void> {
    const evento = (payload && typeof payload === 'object' ? payload : {}) as Record<string, any>;
    const eventId = typeof evento.eventId === 'string' && /^[0-9a-f-]{36}$/i.test(evento.eventId) ? evento.eventId : null;
    const texto = (valor: unknown, maximo: number) =>
      typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, maximo) : null;
    try {
      await this.dataSource.createQueryBuilder()
        .insert()
        .into(DemandaRechazada)
        .values({
          eventId,
          origen: texto(evento.data?.origen, 20),
          demandaExternaId: texto(evento.data?.demandaExternaId, 80),
          motivo: motivoRechazo(error),
          detalle: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          payload: payload && typeof payload === 'object' ? payload : null,
          messageId: messageId ?? null,
        })
        .orIgnore()
        .execute();
    } catch {
      // La traza no debe impedir el ACK de un mensaje que nunca podrá procesarse.
    }
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
    // ABC-357: idempotencia por demanda externa, aunque llegue con otro eventId.
    const contenidoHash = hashContenido(evento.data);
    const existente = await manager.findOne(Demanda, {
      where: { origen: evento.data.origen, demandaExternaId: evento.data.demandaExternaId },
      lock: { mode: 'pessimistic_write' },
    });
    if (existente) {
      if (existente.contenidoHash !== contenidoHash) {
        throw new ConflictoDemandaContradictoriaError(evento.data.origen, evento.data.demandaExternaId, existente.id);
      }
      await this.guardarInbox(manager, evento, payloadHash, messageId,
        `Demanda ya registrada por el evento ${existente.eventId}`, ESTADO_INBOX_IGNORADO);
      return { resultado: 'DUPLICADO', eventId: evento.eventId, demandaId: existente.id };
    }

    const demanda = await manager.save(Demanda, manager.create(Demanda, {
      origen: evento.data.origen,
      demandaExternaId: evento.data.demandaExternaId.trim(),
      fechaRequerida: evento.data.fechaRequerida,
      estado: ESTADO_DEMANDA_RECIBIDA,
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      contenidoHash,
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
    estado: EstadoInbox = ESTADO_INBOX_PROCESADO,
  ): Promise<void> {
    await manager.save(EventoInbox, {
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      eventType: evento.eventType,
      payloadHash,
      payload: evento,
      estado,
      messageId: messageId ?? null,
      detalle,
      procesadoEn: new Date(),
    });
  }
}
