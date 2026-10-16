import { writeFileSync } from 'fs';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { SolicitudMaterial } from '../solicitudes-material/entities/solicitud-material.entity';
import { SolicitudMaterialItem } from '../solicitudes-material/entities/solicitud-material-item.entity';
import { IntegracionesController } from './integraciones.controller';
import { IntegracionesService } from './integraciones.service';
import { crearEventoSolicitudMaterial } from './outbox/crear-evento-solicitud-material';
import {
  ESTADO_OUTBOX_PENDIENTE,
  ESTADO_OUTBOX_PROCESANDO,
  ESTADO_OUTBOX_PUBLICADO,
  EventoOutbox,
} from './outbox/entities/evento-outbox.entity';
import { OutboxPublicadorService } from './outbox/outbox-publicador.service';
import { OutboxConfig } from './outbox/outbox.config';
import { OutboxStore, ReclamarEventosOptions } from './outbox/outbox.store';
import { PubSubPublisherService } from './pubsub/pubsub-publisher.service';
import { PUBSUB_CONFIG, PubSubConfig } from './pubsub/pubsub.config';

// Preparación: la orden de prueba ORD-0015 genera la solicitud de material 27,
// cuyo evento queda en el outbox. Cuenta Administrador con integraciones.reintentar
// y cuenta Operario sin él. Cada caso declara su resultado esperado.
const EVENT_ID = '5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d';
const CORRELATION_ID = '9a7e2f10-3c4b-4d5e-8f60-718293a4b5c6';
const TOPIC = 'topic-id-de-ejemplo';
const CUENTAS = {
  administrador: { id: '1', rol: 'Administrador', permisos: ['usuarios.gestionar', 'integraciones.reintentar'] },
  operario: { id: '43', rol: 'Operario', permisos: ['ordenes.consultar', 'materiales.solicitar'] },
};
type Cuenta = keyof typeof CUENTAS | null;

// Emula TypeOrmOutboxStore: reclama copias con token y solo confirma o falla
// si el evento sigue PROCESANDO con el mismo token.
class OutboxEnMemoria implements OutboxStore {
  private tokens = 0;

  constructor(readonly eventos: EventoOutbox[]) {}

  async reclamarPendientes({ ahora, limite, leaseMs }: ReclamarEventosOptions): Promise<EventoOutbox[]> {
    return this.eventos
      .filter((e) => (e.estado === ESTADO_OUTBOX_PENDIENTE && e.proximoIntentoEn <= ahora)
        || (e.estado === ESTADO_OUTBOX_PROCESANDO && e.bloqueoHasta !== null && e.bloqueoHasta <= ahora))
      .slice(0, limite)
      .map((e) => {
        this.tokens += 1;
        Object.assign(e, {
          estado: ESTADO_OUTBOX_PROCESANDO, intentos: e.intentos + 1, ultimoIntentoEn: ahora,
          bloqueoToken: `token-${this.tokens}`, bloqueoHasta: new Date(ahora.getTime() + leaseMs),
        });
        return structuredClone(e);
      });
  }

  async marcarPublicado(evento: EventoOutbox, messageId: string, publicadoEn: Date): Promise<void> {
    const actual = this.vigente(evento);
    if (actual) Object.assign(actual, { estado: ESTADO_OUTBOX_PUBLICADO, messageId, publicadoEn, ultimoError: null, bloqueoToken: null, bloqueoHasta: null });
  }

  async marcarFallo(evento: EventoOutbox, error: string, proximoIntentoEn: Date): Promise<void> {
    const actual = this.vigente(evento);
    if (actual) Object.assign(actual, { estado: ESTADO_OUTBOX_PENDIENTE, ultimoError: error, proximoIntentoEn, bloqueoToken: null, bloqueoHasta: null });
  }

  private vigente(evento: EventoOutbox) {
    return this.eventos.find((e) => e.id === evento.id && e.estado === ESTADO_OUTBOX_PROCESANDO && e.bloqueoToken === evento.bloqueoToken);
  }
}

function eventoDeSolicitud(): EventoOutbox {
  const payload = crearEventoSolicitudMaterial(
    { id: '27', solicitanteUsuarioId: '42' } as unknown as SolicitudMaterial,
    { id: 15, codigo: 'ORD-0015', fecha_programada: '2026-10-20' } as unknown as OrdenProduccion,
    [{
      item: { materialId: '8', cantidad: '12.5000', unidad: 'kg' } as unknown as SolicitudMaterialItem,
      material: { codigo: 'HAR-001', nombre: 'Harina de trigo' } as unknown as Material,
    }],
    { eventId: EVENT_ID, correlationId: CORRELATION_ID, ocurridoEn: new Date() },
  );
  const ahora = new Date();
  return {
    id: '1', eventId: payload.eventId, correlationId: payload.correlationId, eventType: payload.eventType,
    aggregateType: 'SolicitudMaterial', aggregateId: '27', payload,
    estado: ESTADO_OUTBOX_PENDIENTE, intentos: 0, messageId: null, ultimoError: null,
    proximoIntentoEn: ahora, ultimoIntentoEn: null, bloqueoToken: null, bloqueoHasta: null,
    publicadoEn: null, creadoEn: ahora, actualizadoEn: ahora,
  };
}

describe('Integraciones: caída de Pub/Sub, mensaje repetido y permisos', () => {
  let app: INestApplication;
  let base: string;
  let eventos: EventoOutbox[];
  let store: OutboxEnMemoria;
  let worker: OutboxPublicadorService;
  let authDisponible: boolean;
  // Pub/Sub simulado: acepta mensajes aunque el suscriptor esté detenido;
  // los aceptados quedan en la suscripción sin consumir.
  let pubsub: { caido: boolean; suscripcion: Array<{ messageId: string; attributes: Record<string, string>; evento: { eventId: string } }> };
  const bitacora: Array<{ paso: string; status: number; eventos: unknown[] }> = [];
  const pubsubConfig: PubSubConfig = { enabled: false, projectId: 'taller-sis-pruebas', topicId: TOPIC };
  const outboxConfig: OutboxConfig = { enabled: false, batchSize: 20, pollIntervalMs: 5000, leaseMs: 30000, retryBaseMs: 1000, retryMaxMs: 60000 };
  const httpFetch = global.fetch;

  const repositorio = {
    findAndCount: jest.fn(async ({ where, skip, take }) => {
      const lista = eventos.filter((e) => !where.estado || e.estado === where.estado);
      return [lista.slice(skip, skip + take), lista.length];
    }),
    findOne: jest.fn(async ({ where }) => eventos.find((e) => e.id === where.id) ?? null),
    save: jest.fn(async (evento) => evento),
  };
  const transaction = jest.fn(async (callback) => callback({ getRepository: () => repositorio }));
  const publishMessage = jest.fn(async ({ data, attributes }: { data: Buffer; attributes: Record<string, string> }) => {
    if (pubsub.caido) throw new Error('14 UNAVAILABLE: No connection established');
    const messageId = `msg-${publishMessage.mock.calls.length}`;
    pubsub.suscripcion.push({ messageId, attributes, evento: JSON.parse(data.toString('utf8')) });
    return messageId;
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [IntegracionesController],
      providers: [IntegracionesService, PermisoProduccionGuard,
        { provide: DataSource, useValue: { getRepository: () => repositorio, transaction } },
        { provide: PUBSUB_CONFIG, useValue: pubsubConfig }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pubsubConfig.enabled = false;
    outboxConfig.enabled = false;
    pubsub = { caido: false, suscripcion: [] };
    authDisponible = true;
    eventos = [eventoDeSolicitud()];
    store = new OutboxEnMemoria(eventos);
    worker = new OutboxPublicadorService(
      store,
      new PubSubPublisherService(pubsubConfig, { topic: () => ({ publishMessage }) } as never),
      outboxConfig,
    );

    // Auth responde /me según el token; cada token es una cuenta de prueba.
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      if (!authDisponible) throw new TypeError('fetch failed');
      const token = (new Headers(init?.headers).get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const cuenta = CUENTAS[token as keyof typeof CUENTAS];
      return cuenta
        ? new Response(JSON.stringify(cuenta), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ message: 'Sesión inválida' }), { status: 401 });
    });
  });

  afterEach(() => {
    worker.onModuleDestroy();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    // Con EVIDENCIA_INTEGRACIONES=<ruta> se guardan IDs y estados observados en el panel.
    if (process.env.EVIDENCIA_INTEGRACIONES) {
      writeFileSync(process.env.EVIDENCIA_INTEGRACIONES, JSON.stringify(bitacora, null, 2));
    }
  });

  async function panel(paso: string, cuenta: Cuenta = 'administrador') {
    const response = await httpFetch(`${base}/integraciones/eventos`, {
      headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    const body = await response.json();
    bitacora.push({ paso, status: response.status, eventos: body.items ?? [body] });
    return { status: response.status, body };
  }

  async function reintentar(paso: string, cuenta: Cuenta = 'administrador') {
    const response = await httpFetch(`${base}/integraciones/eventos/1/reintentar`, {
      method: 'POST', headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    const body = await response.json();
    bitacora.push({ paso, status: response.status, eventos: [body.evento ?? body] });
    return { status: response.status, body };
  }

  const despuesDe = (ms: number) => new Date(Date.now() + ms);

  describe('publicador detenido y restaurado (ejemplo de la HU)', () => {
    it('válido: el evento queda pendiente con el publicador detenido y al restaurarlo se publica una sola vez', async () => {
      worker.onModuleInit();
      await new Promise((resolve) => setImmediate(resolve));
      expect(publishMessage).not.toHaveBeenCalled();

      const detenido = await panel('Publicador detenido: el administrador consulta el panel');
      expect(detenido.status).toBe(200);
      expect(detenido.body.items).toEqual([expect.objectContaining({
        eventId: EVENT_ID, correlationId: CORRELATION_ID, eventType: 'SolicitudMaterialAlmacen.v1',
        destinoConfigurado: TOPIC, publicadorHabilitado: false, estado: 'PENDIENTE', intentos: 0,
        ultimoError: null, messageId: null, puedeReintentar: true,
      })]);

      pubsubConfig.enabled = true;
      await expect(worker.procesarPendientes()).resolves.toEqual({ reclamados: 1, publicados: 1, fallidos: 0 });
      await expect(worker.procesarPendientes(despuesDe(60000))).resolves.toEqual({ reclamados: 0, publicados: 0, fallidos: 0 });

      const restaurado = await panel('Publicador restaurado: el evento sale y no se vuelve a publicar');
      expect(restaurado.body.items).toEqual([expect.objectContaining({
        eventId: EVENT_ID, estado: 'PUBLICADO', intentos: 1, messageId: 'msg-1', publicadorHabilitado: true, puedeReintentar: false,
      })]);
      expect(pubsub.suscripcion).toHaveLength(1);
      expect(pubsub.suscripcion[0].attributes).toMatchObject({ eventId: EVENT_ID, correlationId: CORRELATION_ID });
    });
  });

  describe('Pub/Sub caído', () => {
    it('conserva el evento pendiente con intento y error, respeta la espera y al volver Pub/Sub lo publica una vez', async () => {
      pubsubConfig.enabled = true;
      pubsub.caido = true;
      await expect(worker.procesarPendientes()).resolves.toEqual({ reclamados: 1, publicados: 0, fallidos: 1 });
      await expect(worker.procesarPendientes()).resolves.toMatchObject({ reclamados: 0 });

      const caido = await panel('Pub/Sub caído: el evento sigue pendiente con el error');
      expect(caido.body.items).toEqual([expect.objectContaining({
        eventId: EVENT_ID, estado: 'PENDIENTE', intentos: 1, messageId: null,
        ultimoError: '14 UNAVAILABLE: No connection established', puedeReintentar: true,
      })]);
      expect(new Date(caido.body.items[0].proximoIntentoEn).getTime()).toBeGreaterThan(Date.now());

      pubsub.caido = false;
      await expect(worker.procesarPendientes(despuesDe(1000))).resolves.toEqual({ reclamados: 1, publicados: 1, fallidos: 0 });
      const recuperado = await panel('Pub/Sub recuperado: publicado con el mismo eventId');
      expect(recuperado.body.items).toEqual([expect.objectContaining({ eventId: EVENT_ID, estado: 'PUBLICADO', intentos: 2, ultimoError: null })]);
      expect(pubsub.suscripcion.map((m) => m.evento.eventId)).toEqual([EVENT_ID]);
    });

    it('el reintento administrativo adelanta el intento sin contar intentos ni borrar el error, y no publica por sí solo', async () => {
      pubsubConfig.enabled = true;
      pubsub.caido = true;
      await worker.procesarPendientes();

      const respuesta = await reintentar('Pub/Sub caído: el administrador programa un reintento');
      expect(respuesta.status).toBe(202);
      expect(respuesta.body).toMatchObject({ mensaje: 'Reintento programado', evento: { estado: 'PENDIENTE', intentos: 1, ultimoError: '14 UNAVAILABLE: No connection established' } });
      expect(new Date(respuesta.body.evento.proximoIntentoEn).getTime()).toBeLessThanOrEqual(Date.now());
      expect(publishMessage).toHaveBeenCalledTimes(1);

      pubsub.caido = false;
      await expect(worker.procesarPendientes()).resolves.toEqual({ reclamados: 1, publicados: 1, fallidos: 0 });
      expect(pubsub.suscripcion).toHaveLength(1);
    });
  });

  describe('suscriptor detenido', () => {
    it('publicado solo indica que Pub/Sub aceptó el mensaje y el reintento del outbox no reenvía (409)', async () => {
      pubsubConfig.enabled = true;
      await worker.procesarPendientes();

      const publicado = await panel('Suscriptor detenido: Pub/Sub aceptó y el mensaje espera en la suscripción');
      expect(publicado.body.items[0]).toMatchObject({ estado: 'PUBLICADO', messageId: 'msg-1', puedeReintentar: false });
      expect(Object.keys(publicado.body.items[0]).sort()).toEqual([
        'correlationId', 'creadoEn', 'destinoConfigurado', 'estado', 'eventId', 'eventType', 'id', 'intentos',
        'messageId', 'proximoIntentoEn', 'publicadoEn', 'publicadorHabilitado', 'puedeReintentar', 'ultimoError', 'ultimoIntentoEn',
      ]);
      expect(pubsub.suscripcion).toHaveLength(1);

      const rechazo = await reintentar('Suscriptor detenido: reintento de un evento ya publicado');
      expect(rechazo.status).toBe(409);
      await worker.procesarPendientes(despuesDe(60000));
      expect(publishMessage).toHaveBeenCalledTimes(1);
      expect(pubsub.suscripcion).toHaveLength(1);
    });
  });

  describe('mensaje repetido', () => {
    it('dos reintentos seguidos del administrador no duplican el evento ni la publicación', async () => {
      pubsubConfig.enabled = true;
      pubsub.caido = true;
      await worker.procesarPendientes();

      expect((await reintentar('Mensaje repetido: primer reintento')).status).toBe(202);
      expect((await reintentar('Mensaje repetido: segundo reintento seguido')).status).toBe(202);
      expect(eventos).toHaveLength(1);
      expect(eventos[0].intentos).toBe(1);

      pubsub.caido = false;
      await worker.procesarPendientes();
      await worker.procesarPendientes(despuesDe(60000));
      expect(publishMessage).toHaveBeenCalledTimes(2);
      expect(pubsub.suscripcion).toHaveLength(1);
    });

    it('si se pierde la confirmación tras publicar, el reenvío conserva eventId y correlationId para que el receptor deduplique', async () => {
      pubsubConfig.enabled = true;
      jest.spyOn(store, 'marcarPublicado').mockRejectedValueOnce(new Error('Conexión con PostgreSQL perdida'));

      await expect(worker.procesarPendientes()).resolves.toEqual({ reclamados: 1, publicados: 0, fallidos: 1 });
      expect(eventos[0]).toMatchObject({ estado: 'PENDIENTE', ultimoError: 'Conexión con PostgreSQL perdida' });
      await expect(worker.procesarPendientes(despuesDe(1000))).resolves.toEqual({ reclamados: 1, publicados: 1, fallidos: 0 });

      await panel('Mensaje repetido: confirmación perdida y reenvío con el mismo eventId');
      expect(pubsub.suscripcion).toHaveLength(2);
      expect(new Set(pubsub.suscripcion.map((m) => m.attributes.eventId))).toEqual(new Set([EVENT_ID]));
      expect(new Set(pubsub.suscripcion.map((m) => m.attributes.correlationId))).toEqual(new Set([CORRELATION_ID]));
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({ estado: 'PUBLICADO', messageId: 'msg-2', intentos: 2 });
    });
  });

  describe('rol sin permiso', () => {
    it('rechazado: el operario sin integraciones.reintentar recibe 403 en el POST y no se publica nada', async () => {
      pubsubConfig.enabled = true;
      pubsub.caido = true;
      await worker.procesarPendientes();
      const antes = structuredClone(eventos[0]);
      publishMessage.mockClear();

      const respuesta = await reintentar('Rol sin permiso: el operario invoca el POST de reintento', 'operario');
      expect(respuesta.status).toBe(403);
      expect(transaction).not.toHaveBeenCalled();
      expect(repositorio.findOne).not.toHaveBeenCalled();
      expect(publishMessage).not.toHaveBeenCalled();
      expect(eventos[0]).toEqual(antes);
    });

    it('el operario tampoco puede consultar el panel → 403', async () => {
      const respuesta = await panel('Rol sin permiso: el operario consulta el panel', 'operario');
      expect(respuesta.status).toBe(403);
      expect(repositorio.findAndCount).not.toHaveBeenCalled();
    });

    it.each([
      ['sin sesión', 401, null, true],
      ['con Auth no disponible', 503, 'administrador', false],
    ] as const)('POST %s → %i y no se publica nada', async (_caso, esperado, cuenta, disponible) => {
      authDisponible = disponible;
      const antes = structuredClone(eventos[0]);
      expect((await reintentar(`Reintento ${_caso}`, cuenta)).status).toBe(esperado);
      expect(transaction).not.toHaveBeenCalled();
      expect(publishMessage).not.toHaveBeenCalled();
      expect(eventos[0]).toEqual(antes);
    });
  });
});
