import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  DESPACHO_RUTA_REGISTRADO_V1,
  DespachoRutaRegistradoV1Event,
  FUENTE_LOGISTICA,
  SALIDA_INVENTARIO_RESULTADO_V1,
  SalidaInventarioResultadoV1Event,
} from './contratos/inventarios-salida-v1';
import {
  ESTADO_OUTBOX_PENDIENTE,
  ESTADO_OUTBOX_PROCESANDO,
  ESTADO_OUTBOX_PUBLICADO,
  EventoOutbox,
} from './outbox/entities/evento-outbox.entity';
import { AGREGADO_RUTA, OutboxEventosDespacho } from './outbox/outbox-eventos-despacho';
import { OutboxPublicadorService } from './outbox/outbox-publicador.service';
import { OutboxStore } from './outbox/outbox.store';
import {
  ESTADO_INBOX_IGNORADO,
  ESTADO_INBOX_PROCESADO,
  EventoInbox,
} from './inbox/entities/evento-inbox.entity';
import {
  ConflictoEventoResultadoSalidaError,
  ProcesadorResultadoSalidaService,
  esErrorPermanenteResultadoSalida,
} from './inbox/procesador-resultado-salida.service';
import { PubSubResultadoSalidaConsumer } from './inbox/pubsub-resultado-salida.consumer';
import { PubSubLogisticaConfig } from './pubsub/pubsub-logistica.config';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { Ruta } from '../rutas/entities/ruta.entity';
import { DespachoService } from '../despacho/despacho.service';

const FUENTE_INVENTARIOS = 'inventarios-service';

/**
 * ABC-389: Suite de Regresión Integral y Criterios de Aceptación (ABC-384: Integración Asíncrona con Inventarios).
 * PRUEBA SIMULADA: Verificación determinista en memoria del ciclo completo outbox -> broker -> inbox -> ruta,
 * resiliencia ante caídas del broker, semántica at-least-once, deduplicación e idempotencia sin requerir Docker ni PostgreSQL real.
 */

describe('ABC-389: Regresión y Criterios de Aceptación (ABC-384: Integración Logística -> Inventarios)', () => {
  let rutas: Map<string, Partial<Ruta>>;
  let outboxRecords: EventoOutbox[];
  let inboxRecords: EventoInbox[];
  let fakeManager: any;
  let fakeDataSource: any;
  let outboxStore: OutboxStore;
  let outboxService: OutboxEventosDespacho;
  let procesadorInbox: ProcesadorResultadoSalidaService;
  let consumer: PubSubResultadoSalidaConsumer;
  let fakePublisher: { publicar: jest.Mock };
  let publicadorService: OutboxPublicadorService;

  const testConfig: PubSubLogisticaConfig = {
    projectId: 'taller-local',
    publicacion: { enabled: true, topicId: 'taller-logistica-salida-test', timeoutMs: 10000 },
    resultado: { enabled: true, subscriptionId: 'taller-logistica-resultado-test' },
    outbox: { batchSize: 10, pollIntervalMs: 1000, leaseMs: 30000, retryBaseMs: 1000, retryMaxMs: 60000 },
  };

  beforeEach(() => {
    rutas = new Map<string, Partial<Ruta>>();
    outboxRecords = [];
    inboxRecords = [];

    // Sembrar ruta inicial en memoria
    rutas.set('10', {
      id: '10',
      estado: EstadoRuta.PLANIFICADA,
      fechaProgramada: '2026-11-15',
      vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02',
      inventarioEstado: null,
      inventarioResultadoEventId: null,
      inventarioResultadoEn: null,
      inventarioCodigoRechazo: null,
      inventarioDetalle: null,
    });

    fakeManager = {
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('FROM boletas_envio')) {
          // Devuelve boletas y sus ítems para el outbox
          return [
            { boleta_id: '1', numero: 'BOL-001', orden_id: '100', referencia: 'LOT-A', cantidad: '12.0000' },
            { boleta_id: '2', numero: 'BOL-002', orden_id: '100', referencia: 'LOT-B', cantidad: '5.5000' },
          ];
        }
        return [];
      }),
      findOne: jest.fn(async (entityClass: any, options: any) => {
        if (entityClass === EventoInbox) {
          return inboxRecords.find((r) => r.eventId === options.where?.eventId) || null;
        }
        if (entityClass === EventoOutbox) {
          return (
            outboxRecords.find((r) => {
              const matchesEventId = !options.where?.eventId || r.eventId === options.where.eventId;
              const matchesType = !options.where?.eventType || r.eventType === options.where.eventType;
              const matchesAgg = !options.where?.aggregateType || r.aggregateType === options.where.aggregateType;
              return matchesEventId && matchesType && matchesAgg;
            }) || null
          );
        }
        if (entityClass === Ruta) {
          const id = options.where?.id;
          return rutas.get(id) || null;
        }
        return null;
      }),
      insert: jest.fn(async (entityClass: any, entity: any) => {
        if (entityClass === EventoOutbox) {
          const nuevo: EventoOutbox = {
            id: String(outboxRecords.length + 1),
            eventId: entity.eventId,
            correlationId: entity.correlationId,
            eventType: entity.eventType,
            aggregateType: entity.aggregateType,
            aggregateId: entity.aggregateId,
            payload: entity.payload,
            estado: entity.estado ?? ESTADO_OUTBOX_PENDIENTE,
            intentos: entity.intentos ?? 0,
            messageId: entity.messageId ?? null,
            ultimoError: entity.ultimoError ?? null,
            proximoIntentoEn: entity.proximoIntentoEn ?? new Date(Date.now() - 1000),
            ultimoIntentoEn: entity.ultimoIntentoEn ?? null,
            bloqueoToken: entity.bloqueoToken ?? null,
            bloqueoHasta: entity.bloqueoHasta ?? null,
            publicadoEn: entity.publicadoEn ?? null,
            creadoEn: new Date(),
            actualizadoEn: new Date(),
          };
          outboxRecords.push(nuevo);
          return { identifiers: [{ id: nuevo.id }] };
        }
        if (entityClass === EventoInbox) {
          const nuevo: EventoInbox = {
            id: String(inboxRecords.length + 1),
            eventId: entity.eventId,
            correlationId: entity.correlationId,
            eventType: entity.eventType,
            payloadHash: entity.payloadHash,
            payload: entity.payload,
            estado: entity.estado,
            messageId: entity.messageId ?? null,
            detalle: entity.detalle ?? null,
            recibidoEn: new Date(),
          };
          inboxRecords.push(nuevo);
          return { identifiers: [{ id: nuevo.id }] };
        }
      }),
      update: jest.fn(async (entityClass: any, criteria: any, partial: any) => {
        if (entityClass === Ruta) {
          const ruta = rutas.get(criteria.id);
          if (ruta) Object.assign(ruta, partial);
          return { affected: 1 };
        }
        if (entityClass === EventoOutbox) {
          const evento = outboxRecords.find((e) => e.id === criteria.id);
          if (evento) {
            if (criteria.estado && evento.estado !== criteria.estado) return { affected: 0 };
            if (criteria.bloqueoToken && evento.bloqueoToken !== criteria.bloqueoToken) return { affected: 0 };
            Object.assign(evento, partial);
            return { affected: 1 };
          }
          return { affected: 0 };
        }
        return { affected: 0 };
      }),
      getRepository: jest.fn((entityClass: any) => ({
        update: (criteria: any, partial: any) => fakeManager.update(entityClass, criteria, partial),
        findOne: (options: any) => fakeManager.findOne(entityClass, options),
        save: (entities: any[]) => {
          for (const ent of entities) {
            const idx = outboxRecords.findIndex((o) => o.id === ent.id);
            if (idx >= 0) outboxRecords[idx] = { ...ent };
          }
          return Promise.resolve(entities);
        },
      })),
    };

    fakeDataSource = {
      transaction: jest.fn(async (callback: (manager: EntityManager) => any) => {
        return callback(fakeManager);
      }),
      getRepository: (entityClass: any) => fakeManager.getRepository(entityClass),
    };

    outboxStore = new OutboxStore(fakeDataSource);
    // Simulación in-memory para reclamarPendientes respetando filtros y locking
    jest.spyOn(outboxStore, 'reclamarPendientes').mockImplementation(async (opts) => {
      const { ahora, limite, leaseMs } = opts;
      const pendientes = outboxRecords.filter(
        (e) =>
          (e.estado === ESTADO_OUTBOX_PENDIENTE && e.proximoIntentoEn <= ahora) ||
          (e.estado === ESTADO_OUTBOX_PROCESANDO && e.bloqueoHasta && e.bloqueoHasta <= ahora),
      ).slice(0, limite);

      const token = randomUUID();
      const bloqueoHasta = new Date(ahora.getTime() + leaseMs);
      for (const e of pendientes) {
        e.estado = ESTADO_OUTBOX_PROCESANDO;
        e.intentos += 1;
        e.ultimoIntentoEn = ahora;
        e.bloqueoToken = token;
        e.bloqueoHasta = bloqueoHasta;
      }
      return pendientes;
    });

    fakePublisher = {
      publicar: jest.fn(async (payload: unknown) => ({
        messageId: 'pubsub-msg-12345',
        topicId: testConfig.publicacion.topicId,
      })),
    };

    publicadorService = new OutboxPublicadorService(outboxStore, fakePublisher as any, testConfig);
    outboxService = new OutboxEventosDespacho();
    procesadorInbox = new ProcesadorResultadoSalidaService(fakeDataSource);
    consumer = new PubSubResultadoSalidaConsumer(procesadorInbox, null, testConfig);
  });

  // Helper para generar una respuesta válida de Inventarios basada en un despacho previo
  function fabricarRespuestaInventarios(
    despachoEvento: DespachoRutaRegistradoV1Event,
    overrides: Partial<SalidaInventarioResultadoV1Event['data']> = {},
    envelopeOverrides: Partial<SalidaInventarioResultadoV1Event> = {},
  ): SalidaInventarioResultadoV1Event {
    return {
      eventId: randomUUID(),
      eventType: SALIDA_INVENTARIO_RESULTADO_V1,
      occurredAt: new Date().toISOString(),
      source: FUENTE_INVENTARIOS,
      correlationId: despachoEvento.correlationId,
      data: {
        rutaId: despachoEvento.data.rutaId,
        requestEventId: despachoEvento.eventId,
        estado: 'ACEPTADA',
        procesadoAt: new Date().toISOString(),
        ...overrides,
      },
      ...envelopeOverrides,
    };
  }

  // Helper para simular un mensaje Pub/Sub oficial recibido
  function crearMensajePubSub(payload: any, messageId = 'pubsub-inbox-msg-1') {
    return {
      id: messageId,
      data: Buffer.from(JSON.stringify(payload), 'utf8'),
      ack: jest.fn(),
      nack: jest.fn(),
    };
  }

  // -----------------------------------------------------------------------------------------
  // CR-01: Flujo Completo Éxito (Salida Aceptada)
  // -----------------------------------------------------------------------------------------
  it('CR-01 (Happy Path): despacho registra outbox, publica en broker, recibe ACEPTADA y actualiza ruta con ACK', async () => {
    // 1. Despacho registra outbox
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10',
      fechaProgramada: '2026-11-15',
      vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02',
      despachadaEn: ahora,
      despachadaPorUsuarioId: '42',
      boletaIds: ['1', '2'],
    });

    expect(outboxRecords).toHaveLength(1);
    const [eventoGuardado] = outboxRecords;
    expect(eventoGuardado.estado).toBe(ESTADO_OUTBOX_PENDIENTE);
    expect(eventoGuardado.aggregateId).toBe('10');
    const despachoPayload = eventoGuardado.payload as DespachoRutaRegistradoV1Event;

    // 2. Ciclo del publicador outbox
    const ciclo = await publicadorService.procesarPendientes(ahora);
    expect(ciclo).toEqual({ reclamados: 1, publicados: 1, fallidos: 0, obsoletos: 0 });
    expect(fakePublisher.publicar).toHaveBeenCalledWith(despachoPayload);
    expect(eventoGuardado.estado).toBe(ESTADO_OUTBOX_PUBLICADO);
    expect(eventoGuardado.messageId).toBe('pubsub-msg-12345');

    // 3. Llega mensaje de Inventarios con resultado ACEPTADA
    const respuesta = fabricarRespuestaInventarios(despachoPayload, { estado: 'ACEPTADA' });
    const msg = crearMensajePubSub(respuesta, 'gcp-msg-999');
    await consumer.procesarMensaje(msg);

    // 4. Verificaciones de negocio
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.nack).not.toHaveBeenCalled();
    const rutaActualizada = rutas.get('10')!;
    expect(rutaActualizada.inventarioEstado).toBe('ACEPTADA');
    expect(rutaActualizada.inventarioResultadoEventId).toBe(respuesta.eventId);
    expect(inboxRecords).toHaveLength(1);
    expect(inboxRecords[0].estado).toBe(ESTADO_INBOX_PROCESADO);
  });

  // -----------------------------------------------------------------------------------------
  // CR-02: Flujo Salida Rechazada por Inventarios
  // -----------------------------------------------------------------------------------------
  it('CR-02 (Rechazo): procesa resultado RECHAZADA, almacena código y detalle sin revertir estado DESPACHADA', async () => {
    rutas.get('10')!.estado = EstadoRuta.DESPACHADA;
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10',
      fechaProgramada: '2026-11-15',
      vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02',
      despachadaEn: ahora,
      despachadaPorUsuarioId: '42',
      boletaIds: ['1', '2'],
    });
    const despachoPayload = outboxRecords[0].payload as DespachoRutaRegistradoV1Event;

    const respuesta = fabricarRespuestaInventarios(despachoPayload, {
      estado: 'RECHAZADA',
      codigoRechazo: 'STOCK_INSUFICIENTE',
      detalle: 'Lote LOT-A no cuenta con balance suficiente en almacén central',
    });

    const msg = crearMensajePubSub(respuesta);
    await consumer.procesarMensaje(msg);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    const ruta = rutas.get('10')!;
    expect(ruta.estado).toBe('DESPACHADA'); // El estado de la ruta permanece despachada
    expect(ruta.inventarioEstado).toBe('RECHAZADA');
    expect(ruta.inventarioCodigoRechazo).toBe('STOCK_INSUFICIENTE');
    expect(ruta.inventarioDetalle).toContain('Lote LOT-A');
    expect(inboxRecords[0].estado).toBe(ESTADO_INBOX_PROCESADO);
  });

  // -----------------------------------------------------------------------------------------
  // CR-03: Deduplicación en Inbox (Redelivery Idéntico)
  // -----------------------------------------------------------------------------------------
  it('CR-03 (Idempotencia / Duplicados): redelivery idéntica responde DUPLICADO con ACK sin reescribir la ruta', async () => {
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02', despachadaEn: ahora, despachadaPorUsuarioId: '42', boletaIds: ['1', '2'],
    });
    const despachoPayload = outboxRecords[0].payload as DespachoRutaRegistradoV1Event;
    const respuesta = fabricarRespuestaInventarios(despachoPayload);

    // Primer procesamiento
    const msg1 = crearMensajePubSub(respuesta, 'msg-100');
    await consumer.procesarMensaje(msg1);
    expect(msg1.ack).toHaveBeenCalledTimes(1);
    expect(inboxRecords).toHaveLength(1);

    // Redelivery del mismo mensaje exacto por parte del broker
    const msg2 = crearMensajePubSub(respuesta, 'msg-100-redelivery');
    const updateSpy = jest.spyOn(fakeManager, 'update');
    updateSpy.mockClear();

    await consumer.procesarMensaje(msg2);

    expect(msg2.ack).toHaveBeenCalledTimes(1); // Hace ACK para no saturar al broker
    expect(inboxRecords).toHaveLength(1); // No agrega una segunda fila al inbox
    expect(updateSpy).not.toHaveBeenCalled(); // No reescribe la ruta
  });

  // -----------------------------------------------------------------------------------------
  // CR-04: Mensaje Contradictorio (Mismo eventId, Hash Diferente)
  // -----------------------------------------------------------------------------------------
  it('CR-04 (Mensaje Contradictorio): mismo eventId con contenido alterado lanza Conflicto y realiza ACK para evitar Poison Pill', async () => {
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02', despachadaEn: ahora, despachadaPorUsuarioId: '42', boletaIds: ['1', '2'],
    });
    const despachoPayload = outboxRecords[0].payload as DespachoRutaRegistradoV1Event;

    const original = fabricarRespuestaInventarios(despachoPayload, { estado: 'ACEPTADA' });
    await consumer.procesarMensaje(crearMensajePubSub(original));

    // Mismo eventId pero alguien alteró el estado a RECHAZADA (divergencia de hash)
    const alterado = {
      ...original,
      data: { ...original.data, estado: 'RECHAZADA', codigoRechazo: 'HACK' },
    };

    const msgContradictorio = crearMensajePubSub(alterado);
    await consumer.procesarMensaje(msgContradictorio);

    // Debe confirmarse (ACK) para evitar loop infinito en Pub/Sub y no alterar el estado de la ruta
    expect(msgContradictorio.ack).toHaveBeenCalledTimes(1);
    expect(msgContradictorio.nack).not.toHaveBeenCalled();
    expect(rutas.get('10')!.inventarioEstado).toBe('ACEPTADA');
  });

  // -----------------------------------------------------------------------------------------
  // CR-05: Correlación Inválida (Despacho No Encontrado)
  // -----------------------------------------------------------------------------------------
  it('CR-05 (Correlación Inexistente): respuesta referida a un requestEventId desconocido es rechazada con ACK', async () => {
    const respuestaHuerfana: SalidaInventarioResultadoV1Event = {
      eventId: randomUUID(),
      eventType: SALIDA_INVENTARIO_RESULTADO_V1,
      occurredAt: new Date().toISOString(),
      source: FUENTE_INVENTARIOS,
      correlationId: randomUUID(),
      data: {
        rutaId: '999',
        requestEventId: randomUUID(), // ID que no existe en outbox
        estado: 'ACEPTADA',
        procesadoAt: new Date().toISOString(),
      },
    };

    const msg = crearMensajePubSub(respuestaHuerfana);
    await consumer.procesarMensaje(msg);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(inboxRecords).toHaveLength(0);
  });

  // -----------------------------------------------------------------------------------------
  // CR-06: Correlación Divergente (Ruta o CorrelationId Distinto)
  // -----------------------------------------------------------------------------------------
  it('CR-06 (Correlación Adulterada): rutaId o correlationId discrepante con el outbox original es rechazado con ACK', async () => {
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02', despachadaEn: ahora, despachadaPorUsuarioId: '42', boletaIds: ['1', '2'],
    });
    const despachoPayload = outboxRecords[0].payload as DespachoRutaRegistradoV1Event;

    // Respuesta con correlationId inventado
    const adulterada = fabricarRespuestaInventarios(despachoPayload, {}, { correlationId: randomUUID() });

    const msg = crearMensajePubSub(adulterada);
    await consumer.procesarMensaje(msg);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(inboxRecords).toHaveLength(0);
    expect(rutas.get('10')!.inventarioEstado).toBeNull();
  });

  // -----------------------------------------------------------------------------------------
  // CR-07: Caída del Broker y Resiliencia en Outbox
  // -----------------------------------------------------------------------------------------
  it('CR-07 (Broker Caído / Timeout): conserva PENDIENTE, incrementa intentos y agenda backoff exponencial', async () => {
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02', despachadaEn: ahora, despachadaPorUsuarioId: '42', boletaIds: ['1', '2'],
    });

    // Simular falla de broker / timeout
    fakePublisher.publicar.mockRejectedValueOnce(new Error('DEADLINE_EXCEEDED: timeout al publicar en PubSub'));

    const ciclo = await publicadorService.procesarPendientes(ahora);
    expect(ciclo).toEqual({ reclamados: 1, publicados: 0, fallidos: 1, obsoletos: 0 });

    const [evento] = outboxRecords;
    expect(evento.estado).toBe(ESTADO_OUTBOX_PENDIENTE);
    expect(evento.intentos).toBe(1);
    expect(evento.ultimoError).toContain('DEADLINE_EXCEEDED');
    expect(evento.proximoIntentoEn.getTime()).toBeGreaterThan(ahora.getTime());
  });

  // -----------------------------------------------------------------------------------------
  // CR-08: Recuperación tras Reinicio del Microservicio
  // -----------------------------------------------------------------------------------------
  it('CR-08 (Reinicio de Servicio): evento en PENDIENTE sobrevive y se publica con el MISMO eventId original tras reiniciar', async () => {
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02', despachadaEn: ahora, despachadaPorUsuarioId: '42', boletaIds: ['1', '2'],
    });
    const originalEventId = outboxRecords[0].eventId;

    // Primer intento falla
    fakePublisher.publicar.mockRejectedValueOnce(new Error('UNAVAILABLE'));
    await publicadorService.procesarPendientes(ahora);

    // Simulación de reinicio del servicio: se crea una nueva instancia de OutboxPublicadorService
    const nuevoPublicador = new OutboxPublicadorService(outboxStore, fakePublisher as any, testConfig);

    // Cuando pasa el backoff y la red vuelve, el nuevo publicador lo retoma
    const momentoRecuperacion = new Date(outboxRecords[0].proximoIntentoEn.getTime() + 100);
    fakePublisher.publicar.mockResolvedValueOnce({ messageId: 'pubsub-msg-recovered', topicId: 'test-topic' });

    const ciclo2 = await nuevoPublicador.procesarPendientes(momentoRecuperacion);
    expect(ciclo2).toEqual({ reclamados: 1, publicados: 1, fallidos: 0, obsoletos: 0 });

    const [evento] = outboxRecords;
    expect(evento.estado).toBe(ESTADO_OUTBOX_PUBLICADO);
    expect(evento.eventId).toBe(originalEventId); // Mismo UUID lógico
    expect(evento.messageId).toBe('pubsub-msg-recovered');
    expect(evento.intentos).toBe(2);
  });

  // -----------------------------------------------------------------------------------------
  // CR-09: Rollback Transaccional en Despacho
  // -----------------------------------------------------------------------------------------
  it('CR-09 (Rollback Atómico): si falla el guardado del evento outbox, el despacho completo se revierte', async () => {
    let rutaEnMemoria = { estado: 'PLANIFICADA' };
    const fakeTransactionalManager = {
      ...fakeManager,
      query: jest.fn(async () => {
        throw new Error('Fallo de conexión en TypeORM');
      }),
    };

    const despachoService = new DespachoService(
      {
        transaction: async (cb: any) => cb(fakeTransactionalManager),
      } as any,
      outboxService,
    );

    // Si la transacción falla, la ruta debe continuar en PLANIFICADA y no persistirse evento
    await expect(
      outboxService.registrarDespacho(fakeTransactionalManager as any, {
        rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
        choferExternoId: 'CHO-02', despachadaEn: new Date(), despachadaPorUsuarioId: '42', boletaIds: ['1'],
      }),
    ).rejects.toThrow('Fallo de conexión en TypeORM');

    expect(outboxRecords).toHaveLength(0);
    expect(rutaEnMemoria.estado).toBe('PLANIFICADA');
  });

  // -----------------------------------------------------------------------------------------
  // CR-10: At-Least-Once y Pérdida de Confirmación Local
  // -----------------------------------------------------------------------------------------
  it('CR-10 (At-Least-Once): re-publicación por lease vencido envía el mismo eventId y el consumidor preserva idempotencia', async () => {
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02', despachadaEn: ahora, despachadaPorUsuarioId: '42', boletaIds: ['1', '2'],
    });
    const despachoPayload = outboxRecords[0].payload as DespachoRutaRegistradoV1Event;

    // Primer worker publica pero falla al marcar en DB (ej. timeout de base de datos)
    fakePublisher.publicar.mockResolvedValueOnce({ messageId: 'msg-first-try', topicId: 'topic' });
    jest.spyOn(outboxStore, 'marcarPublicado').mockResolvedValueOnce(false); // Falla marcar publicado (lease perdido)
    await publicadorService.procesarPendientes(ahora);

    // Segundo ciclo reintenta y publica
    fakePublisher.publicar.mockResolvedValueOnce({ messageId: 'msg-second-try', topicId: 'topic' });
    jest.spyOn(outboxStore, 'marcarPublicado').mockResolvedValueOnce(true);
    const despues = new Date(ahora.getTime() + 31000); // Supera el lease
    await publicadorService.procesarPendientes(despues);

    // Ambos envíos llevaron exactamente el mismo payload y eventId
    expect(fakePublisher.publicar.mock.calls[0][0].eventId).toBe(despachoPayload.eventId);
    expect(fakePublisher.publicar.mock.calls[1][0].eventId).toBe(despachoPayload.eventId);

    // Inventarios responde a cualquiera de las publicaciones y el consumidor opera normalmente
    const resp = fabricarRespuestaInventarios(despachoPayload);
    await consumer.procesarMensaje(crearMensajePubSub(resp));
    expect(rutas.get('10')!.inventarioEstado).toBe('ACEPTADA');
  });

  // -----------------------------------------------------------------------------------------
  // CR-11: Diferenciación de Errores Transitorios (NACK) vs Permanentes (ACK)
  // -----------------------------------------------------------------------------------------
  it('CR-11 (Resiliencia Consumer): error transitorio emite NACK; error permanente/sintáctico emite ACK', async () => {
    // 1. Error permanente: mensaje no es JSON válido
    const badMessage = {
      id: 'bad-json-msg',
      data: Buffer.from('{ corrupt-non-json', 'utf8'),
      ack: jest.fn(),
      nack: jest.fn(),
    };
    await consumer.procesarMensaje(badMessage);
    expect(badMessage.ack).toHaveBeenCalledTimes(1);
    expect(badMessage.nack).not.toHaveBeenCalled();

    // 2. Error transitorio: desconexión repentina de PostgreSQL durante la transacción
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02', despachadaEn: ahora, despachadaPorUsuarioId: '42', boletaIds: ['1', '2'],
    });
    const despachoPayload = outboxRecords[0].payload as DespachoRutaRegistradoV1Event;
    const resp = fabricarRespuestaInventarios(despachoPayload);

    // Forzar falla transitoria en la base de datos
    jest.spyOn(fakeDataSource, 'transaction').mockRejectedValueOnce(new Error('Connection lost / DB unreachable'));

    const transientMessage = crearMensajePubSub(resp, 'transient-msg');
    await consumer.procesarMensaje(transientMessage);

    expect(transientMessage.nack).toHaveBeenCalledTimes(1); // NACK solicita reentrega al broker
    expect(transientMessage.ack).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------------------------
  // CR-12: Segundo Resultado Posterior Ignorado (Primer Resultado es Definitivo)
  // -----------------------------------------------------------------------------------------
  it('CR-12 (Resultado Definitivo): si la ruta ya tiene resultado de inventarios, una respuesta posterior queda IGNORADA con ACK', async () => {
    const ahora = new Date();
    await outboxService.registrarDespacho(fakeManager, {
      rutaId: '10', fechaProgramada: '2026-11-15', vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-02', despachadaEn: ahora, despachadaPorUsuarioId: '42', boletaIds: ['1', '2'],
    });
    const despachoPayload = outboxRecords[0].payload as DespachoRutaRegistradoV1Event;

    // Primer resultado: ACEPTADA
    const primeraResp = fabricarRespuestaInventarios(despachoPayload, { estado: 'ACEPTADA' });
    await consumer.procesarMensaje(crearMensajePubSub(primeraResp));
    expect(rutas.get('10')!.inventarioEstado).toBe('ACEPTADA');

    // Segundo resultado con diferente eventId intenta cambiar a RECHAZADA
    const segundaResp = fabricarRespuestaInventarios(despachoPayload, {
      estado: 'RECHAZADA',
      codigoRechazo: 'EXTEMPORANEO',
    });
    const msg2 = crearMensajePubSub(segundaResp, 'msg-tardia');
    await consumer.procesarMensaje(msg2);

    expect(msg2.ack).toHaveBeenCalledTimes(1);
    expect(rutas.get('10')!.inventarioEstado).toBe('ACEPTADA'); // Preserva el primer resultado definitivo
    expect(inboxRecords).toHaveLength(2);
    expect(inboxRecords[1].estado).toBe(ESTADO_INBOX_IGNORADO);
    expect(inboxRecords[1].detalle).toContain('La ruta ya tiene resultado de Inventarios ACEPTADA');
  });
});
