import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  CierreProduccion,
  ESTADO_CONTABLE_PENDIENTE,
} from '../../cierre-produccion/entities/cierre-produccion.entity';
import {
  EventoContabilidadV1InvalidoError,
  validarCorrelacionRegistroContableV1,
  validarRegistroContableResultadoV1,
} from '../contratos/contabilidad-v1.validator';
import { PRODUCCION_CERRADA_V1, RegistroContableResultadoV1Event } from '../contratos/contabilidad-v1';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import {
  ESTADO_INBOX_IGNORADO,
  ESTADO_INBOX_PROCESADO,
  EstadoInbox,
  EventoInbox,
} from './entities/evento-inbox.entity';

export type ResultadoProcesamientoContable = 'PROCESADO' | 'IGNORADO' | 'DUPLICADO';

export interface ResultadoContableProcesado {
  resultado: ResultadoProcesamientoContable;
  eventId: string;
  cierreId: string;
  estadoContable?: 'RECIBIDO' | 'RECHAZADO';
}

export class ConflictoIntegridadResultadoContableError extends Error {
  constructor(readonly eventId: string) {
    super(`El eventId ${eventId} ya fue recibido con contenido diferente`);
    this.name = 'ConflictoIntegridadResultadoContableError';
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

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(ordenar(value))).digest('hex');
}

export function esErrorPermanenteResultadoContable(error: unknown): boolean {
  return error instanceof SyntaxError
    || error instanceof EventoContabilidadV1InvalidoError
    || error instanceof ConflictoIntegridadResultadoContableError
    || error instanceof NotFoundException
    || error instanceof ConflictException;
}

@Injectable()
export class ProcesadorResultadoContableService {
  constructor(private readonly dataSource: DataSource) {}

  async procesar(payload: unknown, messageId?: string): Promise<ResultadoContableProcesado> {
    const evento = validarRegistroContableResultadoV1(payload);
    const payloadHash = hashPayload(evento);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const previo = await manager.findOne(EventoInbox, { where: { eventId: evento.eventId } });
        if (previo) {
          if (previo.payloadHash !== payloadHash) throw new ConflictoIntegridadResultadoContableError(evento.eventId);
          return { resultado: 'DUPLICADO', eventId: evento.eventId, cierreId: evento.data.cierreId };
        }
        return this.aplicar(manager, evento, payloadHash, messageId);
      });
    } catch (error) {
      const dbError = (error as { driverError?: { code?: string; constraint?: string } })?.driverError ?? error;
      if ((dbError as { code?: string }).code === '23505'
        && (dbError as { constraint?: string }).constraint === 'uq_eventos_inbox_event_id') {
        const previo = await this.dataSource.getRepository(EventoInbox).findOneByOrFail({ eventId: evento.eventId });
        if (previo.payloadHash !== payloadHash) throw new ConflictoIntegridadResultadoContableError(evento.eventId);
        return { resultado: 'DUPLICADO', eventId: evento.eventId, cierreId: evento.data.cierreId };
      }
      throw error;
    }
  }

  private async aplicar(
    manager: EntityManager,
    evento: RegistroContableResultadoV1Event,
    payloadHash: string,
    messageId?: string,
  ): Promise<ResultadoContableProcesado> {
    const original = await manager.findOne(EventoOutbox, {
      where: {
        eventId: evento.data.requestEventId,
        eventType: PRODUCCION_CERRADA_V1,
        aggregateType: 'CierreProduccion',
        aggregateId: evento.data.cierreId,
      },
    });
    if (!original) throw new NotFoundException('No existe el evento de cierre referido por la respuesta');
    validarCorrelacionRegistroContableV1(original.payload, evento);

    const cierre = await manager.findOne(CierreProduccion, {
      where: { id: evento.data.cierreId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!cierre) throw new NotFoundException(`Cierre ${evento.data.cierreId} no encontrado`);
    if (cierre.ordenId !== String(evento.data.ordenId) || cierre.cierreVersion !== evento.data.cierreVersion) {
      throw new ConflictException('La referencia del resultado no coincide con el cierre persistido');
    }

    let resultado: ResultadoProcesamientoContable = 'PROCESADO';
    let estadoInbox: EstadoInbox = ESTADO_INBOX_PROCESADO;
    let detalleInbox: string | null = null;
    if (cierre.estadoContable !== ESTADO_CONTABLE_PENDIENTE) {
      resultado = 'IGNORADO';
      estadoInbox = ESTADO_INBOX_IGNORADO;
      detalleInbox = `El cierre ya tiene estado contable final ${cierre.estadoContable}`;
    } else {
      cierre.estadoContable = evento.data.estado;
      cierre.resultadoContableEventId = evento.eventId;
      cierre.resultadoContableEn = new Date(evento.data.procesadoAt);
      cierre.codigoRechazoContable = evento.data.codigoRechazo?.trim() ?? null;
      cierre.detalleContable = evento.data.detalle?.trim() ?? null;
      await manager.save(CierreProduccion, cierre);
    }

    await manager.save(EventoInbox, {
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      eventType: evento.eventType,
      payloadHash,
      payload: evento,
      estado: estadoInbox,
      messageId: messageId ?? null,
      detalle: detalleInbox,
      procesadoEn: new Date(),
    });
    return {
      resultado,
      eventId: evento.eventId,
      cierreId: evento.data.cierreId,
      estadoContable: evento.data.estado,
    };
  }
}
