import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import {
  EventoInventarioV1InvalidoError,
  validarCorrelacionSolicitudMaterialInventarioV1,
  validarSolicitudMaterialAlmacenEstadoActualizadoV1,
} from '../contratos/inventario-almacen-v1.validator';
import { SOLICITUD_MATERIAL_ALMACEN_V1 } from '../contratos/inventario-almacen-v1';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { SolicitudMaterial } from '../../solicitudes-material/entities/solicitud-material.entity';
import {
  ESTADO_INBOX_IGNORADO,
  ESTADO_INBOX_PROCESADO,
  EstadoInbox,
  EventoInbox,
} from './entities/evento-inbox.entity';

export type ResultadoInbox = 'PROCESADO' | 'IGNORADO' | 'DUPLICADO';

export interface ResultadoProcesamientoRespuesta {
  resultado: ResultadoInbox;
  eventId: string;
  solicitudId: string;
}

export class ConflictoIntegridadInboxError extends Error {
  constructor(readonly eventId: string) {
    super(`El eventId ${eventId} ya fue recibido con contenido diferente`);
    this.name = 'ConflictoIntegridadInboxError';
  }
}

function ordenar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenar);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>(
      (result, key) => {
        result[key] = ordenar((value as Record<string, unknown>)[key]);
        return result;
      },
      {},
    );
  }
  return value;
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(ordenar(value))).digest('hex');
}

function transicionValida(actual: string, siguiente: string): boolean {
  if (actual === siguiente) return true;
  return actual === 'PENDIENTE' && ['APROBADA', 'CANCELADA'].includes(siguiente);
}

export function esErrorPermanenteRespuestaInventario(error: unknown): boolean {
  return error instanceof SyntaxError
    || error instanceof EventoInventarioV1InvalidoError
    || error instanceof ConflictoIntegridadInboxError
    || error instanceof NotFoundException
    || error instanceof ConflictException;
}

@Injectable()
export class ProcesadorRespuestaInventarioService {
  constructor(private readonly dataSource: DataSource) {}

  async procesar(payload: unknown, messageId?: string): Promise<ResultadoProcesamientoRespuesta> {
    const evento = validarSolicitudMaterialAlmacenEstadoActualizadoV1(payload);
    const payloadHash = hashPayload(evento);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const recibido = await manager.findOne(EventoInbox, { where: { eventId: evento.eventId } });
        if (recibido) {
          if (recibido.payloadHash !== payloadHash) {
            throw new ConflictoIntegridadInboxError(evento.eventId);
          }
          return {
            resultado: 'DUPLICADO',
            eventId: evento.eventId,
            solicitudId: evento.data.solicitudId,
          };
        }

        const solicitudId = evento.data.solicitudId;
        const original = await manager.findOne(EventoOutbox, {
          where: {
            eventId: evento.data.requestEventId,
            eventType: SOLICITUD_MATERIAL_ALMACEN_V1,
            aggregateType: 'SolicitudMaterial',
            aggregateId: solicitudId,
          },
        });
        if (!original) {
          throw new NotFoundException('No existe el evento de solicitud referido por la respuesta');
        }
        validarCorrelacionSolicitudMaterialInventarioV1(original.payload, evento);

        const solicitud = await manager.findOne(SolicitudMaterial, {
          where: { id: solicitudId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!solicitud) throw new NotFoundException(`Solicitud con id ${solicitudId} no encontrada`);

        let resultado: ResultadoInbox = 'PROCESADO';
        let estadoInbox: EstadoInbox = ESTADO_INBOX_PROCESADO;
        let detalle: string | null = null;
        if (evento.data.solicitudVersion <= solicitud.solicitudVersion) {
          resultado = 'IGNORADO';
          estadoInbox = ESTADO_INBOX_IGNORADO;
          detalle = `Version ${evento.data.solicitudVersion} no supera ${solicitud.solicitudVersion}`;
        } else {
          if (evento.data.estadoAnterior !== solicitud.estado) {
            throw new ConflictException('El estado anterior del evento no coincide con la solicitud');
          }
          if (!transicionValida(solicitud.estado, evento.data.estadoNuevo)) {
            throw new ConflictException(`Transicion de solicitud no permitida: ${solicitud.estado} -> ${evento.data.estadoNuevo}`);
          }
          solicitud.estado = evento.data.estadoNuevo;
          solicitud.solicitudVersion = evento.data.solicitudVersion;
          solicitud.estadoActualizadoEn = new Date(evento.data.actualizadoAt);
          solicitud.motivoEstado = evento.data.motivo?.trim() ?? null;
          await manager.save(SolicitudMaterial, solicitud);
        }

        await manager.save(EventoInbox, {
          eventId: evento.eventId,
          correlationId: evento.correlationId,
          eventType: evento.eventType,
          payloadHash,
          payload: evento,
          estado: estadoInbox,
          messageId: messageId ?? null,
          detalle,
          procesadoEn: new Date(),
        });
        return { resultado, eventId: evento.eventId, solicitudId };
      });
    } catch (error) {
      const dbError = (error as { driverError?: { code?: string; constraint?: string } })?.driverError ?? error;
      if ((dbError as { code?: string }).code === '23505'
        && (dbError as { constraint?: string }).constraint === 'uq_eventos_inbox_event_id') {
        const recibido = await this.dataSource.getRepository(EventoInbox).findOneByOrFail({ eventId: evento.eventId });
        if (recibido.payloadHash !== payloadHash) throw new ConflictoIntegridadInboxError(evento.eventId);
        return { resultado: 'DUPLICADO', eventId: evento.eventId, solicitudId: evento.data.solicitudId };
      }
      throw error;
    }
  }
}
