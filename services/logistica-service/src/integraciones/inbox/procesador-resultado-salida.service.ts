import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Ruta } from '../../rutas/entities/ruta.entity';
import {
  DESPACHO_RUTA_REGISTRADO_V1,
  DespachoRutaRegistradoV1Event,
  SalidaInventarioResultadoV1Event,
} from '../contratos/inventarios-salida-v1';
import { EventoSalidaV1InvalidoError, validarSalidaInventarioResultadoV1 } from '../contratos/inventarios-salida-v1.validator';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { AGREGADO_RUTA } from '../outbox/outbox-eventos-despacho';
import { ESTADO_INBOX_IGNORADO, ESTADO_INBOX_PROCESADO, EstadoInbox, EventoInbox } from './entities/evento-inbox.entity';

export type ResultadoProcesamientoSalida = 'PROCESADO' | 'IGNORADO' | 'DUPLICADO';

export interface ResultadoSalidaProcesado {
  resultado: ResultadoProcesamientoSalida;
  eventId: string;
  rutaId: string;
  estado: 'ACEPTADA' | 'RECHAZADA';
}

export class ConflictoEventoResultadoSalidaError extends Error {
  constructor(readonly eventId: string) {
    super(`El eventId ${eventId} ya fue recibido con contenido diferente`);
    this.name = 'ConflictoEventoResultadoSalidaError';
  }
}

/** Errores que no se arreglan reintentando: se confirman (ACK) y quedan en el log. */
export function esErrorPermanenteResultadoSalida(error: unknown): boolean {
  return error instanceof SyntaxError
    || error instanceof EventoSalidaV1InvalidoError
    || error instanceof ConflictoEventoResultadoSalidaError
    || error instanceof NotFoundException
    || error instanceof ConflictException;
}

function ordenar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenar);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((r, k) => {
      r[k] = ordenar((value as Record<string, unknown>)[k]);
      return r;
    }, {});
  }
  return value;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(ordenar(value))).digest('hex');

// ABC-387: aplica la respuesta de Inventarios a la ruta en la misma transacción que
// el inbox. Correlaciona por requestEventId, ruta y correlationId del despacho enviado.
@Injectable()
export class ProcesadorResultadoSalidaService {
  constructor(private readonly dataSource: DataSource) {}

  async procesar(payload: unknown, messageId?: string): Promise<ResultadoSalidaProcesado> {
    const evento = validarSalidaInventarioResultadoV1(payload);
    const payloadHash = hash(evento);
    try {
      return await this.dataSource.transaction((manager) => this.aplicar(manager, evento, payloadHash, messageId));
    } catch (error) {
      // Entrega concurrente del mismo evento: la segunda choca con la unicidad del inbox.
      const db = (error as { driverError?: { code?: string; constraint?: string } })?.driverError ?? error;
      if ((db as { code?: string }).code === '23505' && (db as { constraint?: string }).constraint === 'uq_eventos_inbox_event_id') {
        return this.dataSource.transaction((manager) => this.aplicar(manager, evento, payloadHash, messageId));
      }
      throw error;
    }
  }

  private async aplicar(
    manager: EntityManager,
    evento: SalidaInventarioResultadoV1Event,
    payloadHash: string,
    messageId?: string,
  ): Promise<ResultadoSalidaProcesado> {
    const base = { eventId: evento.eventId, rutaId: evento.data.rutaId, estado: evento.data.estado };
    const previo = await manager.findOne(EventoInbox, { where: { eventId: evento.eventId } });
    if (previo) {
      if (previo.payloadHash !== payloadHash) throw new ConflictoEventoResultadoSalidaError(evento.eventId);
      return { ...base, resultado: 'DUPLICADO' };
    }

    const original = await manager.findOne(EventoOutbox, {
      where: { eventId: evento.data.requestEventId, eventType: DESPACHO_RUTA_REGISTRADO_V1, aggregateType: AGREGADO_RUTA },
    });
    if (!original) throw new NotFoundException('No existe el despacho referido por la respuesta de Inventarios');
    const enviado = original.payload as DespachoRutaRegistradoV1Event;
    if (original.aggregateId !== evento.data.rutaId || enviado.data.rutaId !== evento.data.rutaId) {
      throw new ConflictException('La respuesta de Inventarios no corresponde a la ruta del despacho');
    }
    if (enviado.correlationId !== evento.correlationId) {
      throw new ConflictException('El correlationId de la respuesta no coincide con el del despacho');
    }

    const ruta = await manager.findOne(Ruta, { where: { id: evento.data.rutaId }, lock: { mode: 'pessimistic_write' } });
    if (!ruta) throw new NotFoundException(`Ruta ${evento.data.rutaId} no encontrada`);

    let resultado: ResultadoProcesamientoSalida = 'PROCESADO';
    let estado: EstadoInbox = ESTADO_INBOX_PROCESADO;
    let detalle: string | null = null;
    if (ruta.inventarioEstado !== null) {
      // El primer resultado final es el que vale; los siguientes quedan registrados.
      resultado = 'IGNORADO';
      estado = ESTADO_INBOX_IGNORADO;
      detalle = `La ruta ya tiene resultado de Inventarios ${ruta.inventarioEstado}`;
    } else {
      await manager.update(Ruta, { id: ruta.id }, {
        inventarioEstado: evento.data.estado,
        inventarioResultadoEventId: evento.eventId,
        inventarioResultadoEn: new Date(evento.data.procesadoAt),
        inventarioCodigoRechazo: evento.data.codigoRechazo?.trim() ?? null,
        inventarioDetalle: evento.data.detalle?.trim() || null,
      });
    }

    await manager.insert(EventoInbox, {
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      eventType: evento.eventType,
      payloadHash,
      payload: evento,
      estado,
      messageId: messageId ?? null,
      detalle,
    });
    return { ...base, resultado };
  }
}
