import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  EventoInventarioV1InvalidoError,
  validarCorrelacionDisponibilidadMaterialV1,
  validarCorrelacionSolicitudMaterialInventarioV1,
  validarDisponibilidadMaterialRespondidaV1,
  validarSolicitudMaterialAlmacenEstadoActualizadoV1,
} from '../contratos/inventario-almacen-v1.validator';
import {
  DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1,
  DISPONIBILIDAD_MATERIAL_SOLICITADA_V1,
  DisponibilidadMaterialRespondidaV1Event,
  SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1,
  SOLICITUD_MATERIAL_ALMACEN_V1,
  SolicitudMaterialAlmacenEstadoActualizadoV1Event,
} from '../contratos/inventario-almacen-v1';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { SolicitudMaterial } from '../../solicitudes-material/entities/solicitud-material.entity';
import {
  ESTADO_CONSULTA_DISPONIBILIDAD_RESPONDIDA,
  ConsultaDisponibilidad,
} from '../disponibilidad/entities/consulta-disponibilidad.entity';
import { ConsultaDisponibilidadItem } from '../disponibilidad/entities/consulta-disponibilidad-item.entity';
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
  solicitudId?: string;
  consultaId?: string;
}

type EventoRespuestaInventario =
  | DisponibilidadMaterialRespondidaV1Event
  | SolicitudMaterialAlmacenEstadoActualizadoV1Event;

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

function identidad(evento: EventoRespuestaInventario): Pick<ResultadoProcesamientoRespuesta, 'solicitudId' | 'consultaId'> {
  return evento.eventType === DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1
    ? { consultaId: evento.data.consultaId }
    : { solicitudId: evento.data.solicitudId };
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
    try {
      return await this.procesarRespuesta(payload, messageId);
    } catch (error) {
      if (error instanceof EventoInventarioV1InvalidoError || error instanceof ConflictException) {
        await this.registrarErrorDisponibilidad(payload, error.message);
      }
      throw error;
    }
  }

  private async registrarErrorDisponibilidad(payload: unknown, motivo: string): Promise<void> {
    const evento = payload as Partial<DisponibilidadMaterialRespondidaV1Event> | null;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (evento?.eventType !== DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1
      || evento.source !== 'inventario-service' || !evento.data
      || !uuid.test(evento.data.requestEventId ?? '')
      || !uuid.test(evento.correlationId ?? '')
      || !Number.isSafeInteger(evento.data.ordenId)
      || !Number.isSafeInteger(evento.data.consultaVersion)
      || typeof evento.data.consultaId !== 'string') return;

    await this.dataSource.transaction(async (manager) => {
      const consulta = await manager.findOne(ConsultaDisponibilidad, {
        where: {
          requestEventId: evento.data!.requestEventId,
          correlationId: evento.correlationId,
          consultaId: evento.data!.consultaId,
          consultaVersion: evento.data!.consultaVersion,
          ordenId: String(evento.data!.ordenId),
          estado: 'PENDIENTE',
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (consulta) {
        consulta.errorRespuesta = `Inventarios devolvió una respuesta no válida: ${motivo}`.slice(0, 500);
        await manager.save(ConsultaDisponibilidad, consulta);
      }
    });
  }

  private async procesarRespuesta(payload: unknown, messageId?: string): Promise<ResultadoProcesamientoRespuesta> {
    const evento = this.validarRespuesta(payload);
    const payloadHash = hashPayload(evento);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const recibido = await manager.findOne(EventoInbox, { where: { eventId: evento.eventId } });
        if (recibido) {
          if (recibido.payloadHash !== payloadHash) {
            throw new ConflictoIntegridadInboxError(evento.eventId);
          }
          return { resultado: 'DUPLICADO', eventId: evento.eventId, ...identidad(evento) };
        }

        if (evento.eventType === DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1) {
          return this.procesarDisponibilidad(manager, evento, payloadHash, messageId);
        }
        return this.procesarSolicitudAlmacen(manager, evento, payloadHash, messageId);
      });
    } catch (error) {
      const dbError = (error as { driverError?: { code?: string; constraint?: string } })?.driverError ?? error;
      if ((dbError as { code?: string }).code === '23505'
        && (dbError as { constraint?: string }).constraint === 'uq_eventos_inbox_event_id') {
        const recibido = await this.dataSource.getRepository(EventoInbox)
          .findOneByOrFail({ eventId: evento.eventId });
        if (recibido.payloadHash !== payloadHash) throw new ConflictoIntegridadInboxError(evento.eventId);
        return { resultado: 'DUPLICADO', eventId: evento.eventId, ...identidad(evento) };
      }
      throw error;
    }
  }

  private validarRespuesta(payload: unknown): EventoRespuestaInventario {
    const eventType = payload && typeof payload === 'object'
      ? (payload as { eventType?: unknown }).eventType
      : undefined;
    if (eventType === DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1) {
      return validarDisponibilidadMaterialRespondidaV1(payload);
    }
    if (eventType === SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1) {
      return validarSolicitudMaterialAlmacenEstadoActualizadoV1(payload);
    }
    throw new EventoInventarioV1InvalidoError(
      typeof eventType === 'string' ? eventType : undefined,
      undefined,
      [{
        campo: 'eventType',
        motivo: `debe ser ${DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1} o ${SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1}`,
      }],
    );
  }

  private async procesarSolicitudAlmacen(
    manager: EntityManager,
    evento: SolicitudMaterialAlmacenEstadoActualizadoV1Event,
    payloadHash: string,
    messageId?: string,
  ): Promise<ResultadoProcesamientoRespuesta> {
    const solicitudId = evento.data.solicitudId;
    const original = await manager.findOne(EventoOutbox, {
      where: {
        eventId: evento.data.requestEventId,
        eventType: SOLICITUD_MATERIAL_ALMACEN_V1,
        aggregateType: 'SolicitudMaterial',
        aggregateId: solicitudId,
      },
    });
    if (!original) throw new NotFoundException('No existe el evento de solicitud referido por la respuesta');
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

    await this.guardarInbox(manager, evento, payloadHash, estadoInbox, messageId, detalle);
    return { resultado, eventId: evento.eventId, solicitudId };
  }

  private async procesarDisponibilidad(
    manager: EntityManager,
    evento: DisponibilidadMaterialRespondidaV1Event,
    payloadHash: string,
    messageId?: string,
  ): Promise<ResultadoProcesamientoRespuesta> {
    const original = await manager.findOne(EventoOutbox, {
      where: {
        eventId: evento.data.requestEventId,
        eventType: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1,
        aggregateType: 'ConsultaDisponibilidad',
      },
    });
    if (!original) throw new NotFoundException('No existe el evento de disponibilidad referido por la respuesta');
    validarCorrelacionDisponibilidadMaterialV1(original.payload, evento);

    const consulta = await manager.findOne(ConsultaDisponibilidad, {
      where: { id: original.aggregateId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!consulta) throw new NotFoundException(`Consulta ${evento.data.consultaId} no encontrada`);
    const ultima = await manager.findOne(ConsultaDisponibilidad, {
      where: { ordenId: consulta.ordenId },
      order: { consultaVersion: 'DESC' },
      lock: { mode: 'pessimistic_read' },
    });

    let resultado: ResultadoInbox = 'PROCESADO';
    let estadoInbox: EstadoInbox = ESTADO_INBOX_PROCESADO;
    let detalle: string | null = null;
    if (!ultima || ultima.id !== consulta.id
      || consulta.estado === ESTADO_CONSULTA_DISPONIBILIDAD_RESPONDIDA) {
      resultado = 'IGNORADO';
      estadoInbox = ESTADO_INBOX_IGNORADO;
      detalle = ultima?.id !== consulta.id
        ? `Version ${consulta.consultaVersion} ya no es la vigente`
        : `La consulta ${consulta.consultaId} ya fue respondida`;
    } else {
      const items = await manager.find(ConsultaDisponibilidadItem, {
        where: { consultaDisponibilidadId: consulta.id },
      });
      const porMaterial = new Map(evento.data.materiales.map((item) => [item.materialId, item]));
      for (const item of items) {
        const respuesta = porMaterial.get(item.materialId);
        if (!respuesta) throw new ConflictException(`Falta la respuesta del material ${item.materialId}`);
        item.cantidadDisponible = respuesta.cantidadDisponible;
        item.estado = respuesta.estado;
      }
      await manager.save(ConsultaDisponibilidadItem, items);
      consulta.estado = ESTADO_CONSULTA_DISPONIBILIDAD_RESPONDIDA;
      consulta.responseEventId = evento.eventId;
      consulta.errorRespuesta = null;
      consulta.vigenteEn = new Date(evento.data.vigenteAt);
      await manager.save(ConsultaDisponibilidad, consulta);
    }

    await this.guardarInbox(manager, evento, payloadHash, estadoInbox, messageId, detalle);
    return { resultado, eventId: evento.eventId, consultaId: evento.data.consultaId };
  }

  private async guardarInbox(
    manager: EntityManager,
    evento: EventoRespuestaInventario,
    payloadHash: string,
    estado: EstadoInbox,
    messageId?: string,
    detalle: string | null = null,
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
