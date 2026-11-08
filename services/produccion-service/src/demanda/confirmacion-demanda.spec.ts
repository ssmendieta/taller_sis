import { DEMANDA_CONFIRMADA_V1_EJEMPLO } from '../integraciones/contratos/ventas-confirmacion-demanda-v1';
import {
  EventoConfirmacionDemandaV1InvalidoError,
  validarConfirmacionDemandaV1,
} from '../integraciones/contratos/ventas-confirmacion-demanda-v1.validator';
import {
  ESTADO_INBOX_PENDIENTE,
  ESTADO_INBOX_PROCESADO,
  EventoInbox,
} from '../integraciones/inbox/entities/evento-inbox.entity';
import { loadPubSubDemandaConfirmacionConsumerConfig } from '../integraciones/pubsub/pubsub-demanda-confirmacion-consumer.config';
import { ConfirmacionesDemandaPendientes1710000000028 } from '../database/migrations/1710000000028-ConfirmacionesDemandaPendientes';
import { DemandaRechazada } from './entities/demanda-rechazada.entity';
import { Demanda } from './entities/demanda.entity';
import {
  ConflictoEventoConfirmacionDemandaError,
  ProcesadorConfirmacionDemandaService,
} from './procesador-confirmacion-demanda.service';
import { PubSubDemandaConfirmacionConsumerService } from './pubsub-demanda-confirmacion-consumer.service';

const evento = (cambios: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => {
  const base = JSON.parse(JSON.stringify(DEMANDA_CONFIRMADA_V1_EJEMPLO));
  return { ...base, ...cambios, data: { ...base.data, ...data } };
};

const config = {
  enabled: false,
  projectId: 'taller-local',
  subscriptionId: 'confirmaciones-local',
  retryMaxAttempts: 3,
  retryIntervalMs: 100,
};

function escenario(demandaInicial: Partial<Demanda> | null = null) {
  const inboxes: EventoInbox[] = [];
  const rechazos: any[] = [];
  let demanda = demandaInicial as Demanda | null;
  let secuencia = 1;
  const manager = {
    findOne: jest.fn(async (entity: unknown, options: any) => {
      if (entity === EventoInbox) {
        const where = options.where;
        return inboxes.find((item) => where.eventId ? item.eventId === where.eventId : item.id === where.id) ?? null;
      }
      if (entity === Demanda) {
        const where = options.where;
        return demanda && demanda.origen === where.origen && demanda.demandaExternaId === where.demandaExternaId
          ? demanda : null;
      }
      return null;
    }),
    save: jest.fn(async (entity: unknown, value: any) => {
      if (entity === EventoInbox) {
        const guardado = value as EventoInbox;
        if (!guardado.id) guardado.id = String(secuencia++);
        const indice = inboxes.findIndex((item) => item.id === guardado.id);
        if (indice >= 0) inboxes[indice] = guardado;
        else inboxes.push(guardado);
      }
      if (entity === Demanda) demanda = value;
      return value;
    }),
  };
  const insert = {
    into: () => insert,
    values: (value: any) => { rechazos.push(value); return insert; },
    orIgnore: () => insert,
    execute: jest.fn(async () => undefined),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
    getRepository: jest.fn(() => ({
      find: jest.fn(async () => inboxes.filter((item) =>
        item.estado === ESTADO_INBOX_PENDIENTE
        && item.intentos < config.retryMaxAttempts
        && item.proximoIntentoEn !== null
        && item.proximoIntentoEn <= new Date())),
    })),
    createQueryBuilder: () => ({ insert: () => insert }),
  };
  const confirmarDemanda = jest.fn(async (
    _origen: string,
    _id: string,
    datos: any,
  ) => {
    if (!demanda) throw new Error('demanda ausente');
    if (demanda.estado !== 'CONFIRMADA') {
      demanda.estado = 'CONFIRMADA';
      demanda.confirmadaEn = datos.confirmadaEn;
      demanda.confirmacionEventId = datos.confirmacionEventId;
      demanda.confirmacionCorrelationId = datos.confirmacionCorrelationId;
    }
    return demanda;
  });
  const service = new ProcesadorConfirmacionDemandaService(
    dataSource as any,
    { confirmarDemanda } as any,
    config,
  );
  return {
    service,
    manager,
    dataSource,
    inboxes,
    rechazos,
    confirmarDemanda,
    registrarDemanda: (nueva: Partial<Demanda>) => { demanda = nueva as Demanda; },
    demanda: () => demanda,
  };
}

describe('ABC-365: contrato de confirmacion', () => {
  it('normaliza la clave externa y valida el sobre versionado', () => {
    const validado = validarConfirmacionDemandaV1(evento({}, { demandaExternaId: ' PED-2026-0042 ' }));
    expect(validado.data.demandaExternaId).toBe('PED-2026-0042');
  });

  it.each([
    [{ eventType: 'Otro.v1' }, {}, 'eventType'],
    [{ occurredAt: 'ayer' }, {}, 'occurredAt'],
    [{ eventId: '123' }, {}, 'eventId'],
    [{}, { origen: 'CRM' }, 'data.origen'],
    [{}, { demandaExternaId: ' ' }, 'data.demandaExternaId'],
  ])('rechaza mensajes fuera del contrato', (cambios, data, campo) => {
    expect(() => validarConfirmacionDemandaV1(evento(cambios, data))).toThrow(EventoConfirmacionDemandaV1InvalidoError);
    try {
      validarConfirmacionDemandaV1(evento(cambios, data));
    } catch (error) {
      expect((error as EventoConfirmacionDemandaV1InvalidoError).errores.map((item) => item.campo)).toContain(campo);
    }
  });
});

describe('ABC-365: configuracion local del suscriptor', () => {
  it('queda desactivado por defecto con reintentos acotados', () => {
    expect(loadPubSubDemandaConfirmacionConsumerConfig({})).toMatchObject({
      enabled: false,
      retryMaxAttempts: 5,
      retryIntervalMs: 5000,
    });
  });

  it('exige proyecto y suscripcion al habilitarse', () => {
    expect(() => loadPubSubDemandaConfirmacionConsumerConfig({
      PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_ENABLED: 'true',
    })).toThrow(/GCP_PROJECT_ID/);
    expect(loadPubSubDemandaConfirmacionConsumerConfig({
      PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_ENABLED: 'true',
      GCP_PROJECT_ID: 'taller-local',
      PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID: 'projects/taller-local/subscriptions/confirmaciones-local',
      PUBSUB_DEMANDA_CONFIRMACION_RETRY_MAX_ATTEMPTS: '3',
      PUBSUB_DEMANDA_CONFIRMACION_RETRY_INTERVAL_MS: '100',
    })).toEqual({ ...config, enabled: true });
  });
});

describe('ABC-365: procesamiento idempotente y fuera de orden', () => {
  const demandaRecibida = (): Partial<Demanda> => ({
    id: '10',
    origen: 'VENTAS',
    demandaExternaId: 'PED-2026-0042',
    estado: 'RECIBIDA',
    confirmacionEventId: null,
    confirmacionCorrelationId: null,
    confirmadaEn: null,
  });

  it('confirma la demanda y guarda inbox en la misma transaccion', async () => {
    const ctx = escenario(demandaRecibida());
    await expect(ctx.service.procesar(evento(), 'msg-confirmacion-1')).resolves.toEqual({
      resultado: 'PROCESADO',
      eventId: DEMANDA_CONFIRMADA_V1_EJEMPLO.eventId,
      demandaId: '10',
    });
    expect(ctx.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(ctx.demanda()).toMatchObject({
      estado: 'CONFIRMADA',
      confirmacionEventId: DEMANDA_CONFIRMADA_V1_EJEMPLO.eventId,
      confirmacionCorrelationId: DEMANDA_CONFIRMADA_V1_EJEMPLO.correlationId,
    });
    expect(ctx.inboxes[0]).toMatchObject({
      estado: ESTADO_INBOX_PROCESADO,
      messageId: 'msg-confirmacion-1',
      intentos: 0,
    });
  });

  it('una redelivery no vuelve a confirmar ni duplica el inbox', async () => {
    const ctx = escenario(demandaRecibida());
    await ctx.service.procesar(evento(), 'msg-1');
    await expect(ctx.service.procesar(evento(), 'msg-2')).resolves.toMatchObject({ resultado: 'DUPLICADO' });
    expect(ctx.confirmarDemanda).toHaveBeenCalledTimes(1);
    expect(ctx.inboxes).toHaveLength(1);
  });

  it('el mismo eventId con otro contenido se rechaza y queda trazado', async () => {
    const ctx = escenario(demandaRecibida());
    await ctx.service.procesar(evento(), 'msg-1');
    await expect(ctx.service.procesar(evento({}, { demandaExternaId: 'PED-OTRA' }), 'msg-2'))
      .rejects.toBeInstanceOf(ConflictoEventoConfirmacionDemandaError);
    expect(ctx.rechazos).toEqual([expect.objectContaining({
      motivo: 'EVENTO_CONTRADICTORIO',
      messageId: 'msg-2',
    })]);
  });

  it('conserva pendiente una confirmacion adelantada y la aplica al reprocesar', async () => {
    const ctx = escenario();
    await expect(ctx.service.procesar(evento(), 'msg-antes')).resolves.toMatchObject({ resultado: 'PENDIENTE' });
    expect(ctx.inboxes[0]).toMatchObject({ estado: 'PENDIENTE', intentos: 0 });
    ctx.registrarDemanda(demandaRecibida());
    ctx.inboxes[0].proximoIntentoEn = new Date(Date.now() - 1);
    await expect(ctx.service.reprocesarPendientes()).resolves.toBe(1);
    expect(ctx.demanda()?.estado).toBe('CONFIRMADA');
    expect(ctx.inboxes[0]).toMatchObject({
      estado: 'PROCESADO',
      intentos: 1,
      proximoIntentoEn: null,
      ultimoError: null,
    });
  });

  it('acota los reintentos sin borrar una confirmacion que aun no correlaciona', async () => {
    const ctx = escenario();
    await ctx.service.procesar(evento(), 'msg-pendiente');
    for (let intento = 1; intento <= config.retryMaxAttempts; intento += 1) {
      ctx.inboxes[0].proximoIntentoEn = new Date(Date.now() - 1);
      await ctx.service.reprocesarPendientes();
    }
    expect(ctx.inboxes[0]).toMatchObject({
      estado: 'PENDIENTE',
      intentos: config.retryMaxAttempts,
      proximoIntentoEn: null,
      ultimoError: 'DEMANDA_NO_REGISTRADA',
    });
    expect(ctx.inboxes[0].detalle).toContain('permanece pendiente');
  });

  it('un mensaje invalido conserva el motivo de rechazo', async () => {
    const ctx = escenario();
    await expect(ctx.service.procesar(evento({}, { origen: 'CRM' }), 'msg-invalido'))
      .rejects.toBeInstanceOf(EventoConfirmacionDemandaV1InvalidoError);
    expect(ctx.rechazos).toEqual([expect.objectContaining({
      motivo: 'EVENTO_INVALIDO',
      origen: 'CRM',
      messageId: 'msg-invalido',
    })]);
  });
});

describe('ABC-365: ACK y NACK del consumidor', () => {
  const mensaje = (payload: unknown) => ({
    id: 'msg-1',
    data: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    ack: jest.fn(),
    nack: jest.fn(),
  });
  const consumidor = (processor: any) => new PubSubDemandaConfirmacionConsumerService(
    processor,
    null,
    config,
  );

  it('hace ACK despues de persistir una confirmacion valida o pendiente', async () => {
    const processor = { procesar: jest.fn().mockResolvedValue({ resultado: 'PENDIENTE', eventId: 'e', demandaId: null }) };
    const msg = mensaje(evento());
    await consumidor(processor).procesarMensaje(msg);
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.nack).not.toHaveBeenCalled();
  });

  it('hace NACK ante un fallo transitorio', async () => {
    const processor = { procesar: jest.fn().mockRejectedValue(new Error('connection terminated')) };
    const msg = mensaje(evento());
    await consumidor(processor).procesarMensaje(msg);
    expect(msg.nack).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('registra y confirma JSON malformado para evitar un bucle infinito', async () => {
    const processor = { procesar: jest.fn(), registrarMensajeInvalido: jest.fn().mockResolvedValue(undefined) };
    const msg = mensaje('{no es json');
    await consumidor(processor).procesarMensaje(msg);
    expect(processor.registrarMensajeInvalido).toHaveBeenCalledWith(undefined, expect.any(SyntaxError), 'msg-1');
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });
});

describe('ABC-365: migracion de reintentos de inbox', () => {
  it('agrega trazabilidad e indice parcial de confirmaciones pendientes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new ConfirmacionesDemandaPendientes1710000000028().up({ query } as any);
    const sql = query.mock.calls.map(([sentencia]) => sentencia).join('\n');
    expect(sql).toContain('ADD COLUMN intentos SMALLINT');
    expect(sql).toContain("CHECK (estado IN ('PROCESADO', 'IGNORADO', 'PENDIENTE'))");
    expect(sql).toContain('ADD COLUMN proximo_intento_en TIMESTAMPTZ');
    expect(sql).toContain("WHERE estado = 'PENDIENTE' AND event_type = 'DemandaConfirmada.v1'");
    expect(EventoInbox).toBeDefined();
    expect(DemandaRechazada).toBeDefined();
  });
});
