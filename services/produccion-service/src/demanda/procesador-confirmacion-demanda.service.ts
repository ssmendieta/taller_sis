import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager, LessThan, LessThanOrEqual } from 'typeorm';
import {
  DEMANDA_CONFIRMADA_V1,
  DemandaConfirmadaV1Event,
} from '../integraciones/contratos/ventas-confirmacion-demanda-v1';
import {
  EventoConfirmacionDemandaV1InvalidoError,
  validarConfirmacionDemandaV1,
} from '../integraciones/contratos/ventas-confirmacion-demanda-v1.validator';
import {
  ESTADO_INBOX_IGNORADO,
  ESTADO_INBOX_PENDIENTE,
  ESTADO_INBOX_PROCESADO,
  EventoInbox,
} from '../integraciones/inbox/entities/evento-inbox.entity';
import {
  PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG,
  PubSubDemandaConfirmacionConsumerConfig,
} from '../integraciones/pubsub/pubsub-demanda-confirmacion-consumer.config';
import { DemandaRechazada } from './entities/demanda-rechazada.entity';
import { Demanda, ESTADO_DEMANDA_CONFIRMADA } from './entities/demanda.entity';
import { hashContenido, ProcesadorDemandaService } from './procesador-demanda.service';

export type ResultadoConfirmacionDemanda = 'PROCESADO' | 'DUPLICADO' | 'PENDIENTE';

export interface ConfirmacionDemandaProcesada {
  resultado: ResultadoConfirmacionDemanda;
  eventId: string;
  demandaId: string | null;
}

export class ConflictoEventoConfirmacionDemandaError extends Error {
  constructor(readonly eventId: string) {
    super(`El eventId de confirmacion ${eventId} ya fue recibido con contenido diferente`);
    this.name = 'ConflictoEventoConfirmacionDemandaError';
  }
}

export function esErrorPermanenteConfirmacionDemanda(error: unknown): boolean {
  return error instanceof SyntaxError
    || error instanceof EventoConfirmacionDemandaV1InvalidoError
    || error instanceof ConflictoEventoConfirmacionDemandaError;
}

function esViolacionUnicaInbox(error: unknown): boolean {
  const db = (error as { driverError?: { code?: string; constraint?: string } })?.driverError ?? error;
  return (db as { code?: string }).code === '23505'
    && (db as { constraint?: string }).constraint === 'uq_eventos_inbox_event_id';
}

@Injectable()
export class ProcesadorConfirmacionDemandaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly procesadorDemanda: ProcesadorDemandaService,
    @Optional()
    @Inject(PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG)
    private readonly config?: PubSubDemandaConfirmacionConsumerConfig,
  ) {}

  async procesar(payload: unknown, messageId?: string): Promise<ConfirmacionDemandaProcesada> {
    try {
      const evento = validarConfirmacionDemandaV1(payload);
      const payloadHash = hashContenido(evento);
      for (let intento = 1; ; intento += 1) {
        try {
          return await this.dataSource.transaction((manager) =>
            this.procesarEnTransaccion(manager, evento, payloadHash, messageId));
        } catch (error) {
          if (!esViolacionUnicaInbox(error) || intento >= 2) throw error;
        }
      }
    } catch (error) {
      if (esErrorPermanenteConfirmacionDemanda(error)) {
        await this.registrarRechazo(payload, error, messageId);
      }
      throw error;
    }
  }

  async registrarMensajeInvalido(payload: unknown, error: unknown, messageId?: string): Promise<void> {
    await this.registrarRechazo(payload, error, messageId);
  }

  async reprocesarPendientes(limite = 20): Promise<number> {
    const ahora = new Date();
    const pendientes = await this.dataSource.getRepository(EventoInbox).find({
      select: { id: true },
      where: {
        eventType: DEMANDA_CONFIRMADA_V1,
        estado: ESTADO_INBOX_PENDIENTE,
        intentos: LessThan(this.maxIntentos()),
        proximoIntentoEn: LessThanOrEqual(ahora),
      },
      order: { recibidoEn: 'ASC' },
      take: limite,
    });
    let procesados = 0;
    for (const pendiente of pendientes) {
      if (await this.reprocesarPorId(pendiente.id, ahora)) procesados += 1;
    }
    return procesados;
  }

  private async procesarEnTransaccion(
    manager: EntityManager,
    evento: DemandaConfirmadaV1Event,
    payloadHash: string,
    messageId?: string,
  ): Promise<ConfirmacionDemandaProcesada> {
    const previo = await manager.findOne(EventoInbox, { where: { eventId: evento.eventId } });
    if (previo) {
      if (previo.payloadHash !== payloadHash) {
        throw new ConflictoEventoConfirmacionDemandaError(evento.eventId);
      }
      return {
        resultado: previo.estado === ESTADO_INBOX_PENDIENTE ? 'PENDIENTE' : 'DUPLICADO',
        eventId: evento.eventId,
        demandaId: await this.buscarDemandaId(manager, evento),
      };
    }

    const demanda = await manager.findOne(Demanda, {
      where: { origen: evento.data.origen, demandaExternaId: evento.data.demandaExternaId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!demanda) {
      await manager.save(EventoInbox, this.crearInbox(evento, payloadHash, messageId, ESTADO_INBOX_PENDIENTE, {
        detalle: `Pendiente de correlacion con ${evento.data.origen}/${evento.data.demandaExternaId}`,
        proximoIntentoEn: this.siguienteIntento(),
      }));
      return { resultado: 'PENDIENTE', eventId: evento.eventId, demandaId: null };
    }

    const yaConfirmada = demanda.estado === ESTADO_DEMANDA_CONFIRMADA;
    const confirmada = await this.procesadorDemanda.confirmarDemanda(
      evento.data.origen,
      evento.data.demandaExternaId,
      {
        confirmadaEn: new Date(evento.occurredAt),
        confirmacionEventId: evento.eventId,
        confirmacionCorrelationId: evento.correlationId,
      },
      manager,
    );
    const ignorada = yaConfirmada && confirmada.confirmacionEventId !== evento.eventId;
    await manager.save(EventoInbox, this.crearInbox(
      evento,
      payloadHash,
      messageId,
      ignorada ? ESTADO_INBOX_IGNORADO : ESTADO_INBOX_PROCESADO,
      { detalle: ignorada ? `La demanda ya fue confirmada por ${confirmada.confirmacionEventId ?? 'un evento anterior'}` : null },
    ));
    return {
      resultado: ignorada ? 'DUPLICADO' : 'PROCESADO',
      eventId: evento.eventId,
      demandaId: demanda.id,
    };
  }

  private async reprocesarPorId(id: string, ahora: Date): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const inbox = await manager.findOne(EventoInbox, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inbox
        || inbox.estado !== ESTADO_INBOX_PENDIENTE
        || inbox.intentos >= this.maxIntentos()
        || !inbox.proximoIntentoEn
        || inbox.proximoIntentoEn > ahora) return false;

      const evento = validarConfirmacionDemandaV1(inbox.payload);
      inbox.intentos += 1;
      const demanda = await manager.findOne(Demanda, {
        where: { origen: evento.data.origen, demandaExternaId: evento.data.demandaExternaId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!demanda) {
        const agotado = inbox.intentos >= this.maxIntentos();
        inbox.detalle = agotado
          ? `Correlacion agotada tras ${inbox.intentos} intentos; el evento permanece pendiente`
          : `Demanda ${evento.data.origen}/${evento.data.demandaExternaId} aun no registrada`;
        inbox.ultimoError = 'DEMANDA_NO_REGISTRADA';
        inbox.proximoIntentoEn = agotado ? null : this.siguienteIntento(ahora);
        inbox.procesadoEn = ahora;
        await manager.save(EventoInbox, inbox);
        return true;
      }

      const yaConfirmada = demanda.estado === ESTADO_DEMANDA_CONFIRMADA;
      const confirmada = await this.procesadorDemanda.confirmarDemanda(
        evento.data.origen,
        evento.data.demandaExternaId,
        {
          confirmadaEn: new Date(evento.occurredAt),
          confirmacionEventId: evento.eventId,
          confirmacionCorrelationId: evento.correlationId,
        },
        manager,
      );
      const ignorada = yaConfirmada && confirmada.confirmacionEventId !== evento.eventId;
      inbox.estado = ignorada ? ESTADO_INBOX_IGNORADO : ESTADO_INBOX_PROCESADO;
      inbox.detalle = ignorada ? `La demanda ya fue confirmada por ${confirmada.confirmacionEventId ?? 'un evento anterior'}` : null;
      inbox.ultimoError = null;
      inbox.proximoIntentoEn = null;
      inbox.procesadoEn = ahora;
      await manager.save(EventoInbox, inbox);
      return true;
    });
  }

  private crearInbox(
    evento: DemandaConfirmadaV1Event,
    payloadHash: string,
    messageId: string | undefined,
    estado: EventoInbox['estado'],
    extras: Partial<EventoInbox> = {},
  ): Partial<EventoInbox> {
    return {
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      eventType: evento.eventType,
      payloadHash,
      payload: evento,
      estado,
      messageId: messageId ?? null,
      detalle: null,
      intentos: 0,
      proximoIntentoEn: null,
      ultimoError: null,
      procesadoEn: new Date(),
      ...extras,
    };
  }

  private async buscarDemandaId(manager: EntityManager, evento: DemandaConfirmadaV1Event): Promise<string | null> {
    const demanda = await manager.findOne(Demanda, {
      where: { origen: evento.data.origen, demandaExternaId: evento.data.demandaExternaId },
    });
    return demanda?.id ?? null;
  }

  private maxIntentos(): number {
    return this.config?.retryMaxAttempts ?? 5;
  }

  private siguienteIntento(desde = new Date()): Date {
    return new Date(desde.getTime() + (this.config?.retryIntervalMs ?? 5000));
  }

  private async registrarRechazo(payload: unknown, error: unknown, messageId?: string): Promise<void> {
    const evento = (payload && typeof payload === 'object' ? payload : {}) as Record<string, any>;
    const eventId = typeof evento.eventId === 'string'
      && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(evento.eventId) ? evento.eventId : null;
    const texto = (valor: unknown, maximo: number) =>
      typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, maximo) : null;
    const motivo = error instanceof ConflictoEventoConfirmacionDemandaError
      ? 'EVENTO_CONTRADICTORIO'
      : 'EVENTO_INVALIDO';
    try {
      await this.dataSource.createQueryBuilder()
        .insert()
        .into(DemandaRechazada)
        .values({
          eventId,
          origen: texto(evento.data?.origen, 20),
          demandaExternaId: texto(evento.data?.demandaExternaId, 80),
          motivo,
          detalle: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          payload: payload && typeof payload === 'object' ? payload : null,
          messageId: messageId ?? null,
        })
        .orIgnore()
        .execute();
    } catch {
      // Un fallo de trazabilidad no debe causar redelivery infinito de un mensaje invalido.
    }
  }
}
