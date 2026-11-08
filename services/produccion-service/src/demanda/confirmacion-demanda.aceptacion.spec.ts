import { randomUUID } from 'crypto';
import { DEMANDA_CONFIRMADA_V1_EJEMPLO } from '../integraciones/contratos/ventas-confirmacion-demanda-v1';
import { EventoInbox } from '../integraciones/inbox/entities/evento-inbox.entity';
import { Demanda } from './entities/demanda.entity';
import { ProcesadorConfirmacionDemandaService } from './procesador-confirmacion-demanda.service';
import { ProcesadorDemandaService } from './procesador-demanda.service';
import { PubSubDemandaConfirmacionConsumerService } from './pubsub-demanda-confirmacion-consumer.service';

// ABC-367 (verificación de ABC-130). PRUEBA SIMULADA: PostgreSQL se reemplaza por
// una base en memoria que imita lo que importa para estos criterios: cada
// transacción escribe en un borrador que se aplica al confirmar o se descarta
// (rollback), la fila de demanda bloqueada con pessimistic_write espera a que la
// otra transacción termine y el inbox rechaza un eventId repetido con
// uq_eventos_inbox_event_id. El consumidor, el procesador de confirmaciones y
// ProcesadorDemandaService.confirmarDemanda son los reales. No hay Pub/Sub:
// los mensajes se entregan llamando al consumidor.

const config = {
  enabled: false,
  projectId: 'taller-local',
  subscriptionId: 'confirmaciones-local',
  retryMaxAttempts: 3,
  retryIntervalMs: 100,
};

type Borrador = { demandas: Map<string, Demanda>; inbox: Map<string, EventoInbox>; tenidos: Set<string>; soltar: Array<() => void> };

class BaseSimulada {
  demandas: Demanda[] = [];
  inbox: EventoInbox[] = [];
  rechazos: Array<Record<string, any>> = [];
  transacciones = 0;
  fallarInboxUnaVez = false;
  private idInbox = 1;
  private bloqueos = new Map<string, Promise<void>>();

  registrarDemanda(origen: 'VENTAS' | 'FACTURACION', demandaExternaId: string): Demanda {
    const demanda = {
      id: String(this.demandas.length + 1), origen, demandaExternaId, estado: 'RECIBIDA',
      confirmadaEn: null, confirmacionEventId: null, confirmacionCorrelationId: null,
    } as unknown as Demanda;
    this.demandas.push(demanda);
    return demanda;
  }

  // Reentrante: una transacción puede volver a bloquear la fila que ya tiene.
  private async bloquear(clave: string, borrador: Borrador) {
    if (borrador.tenidos.has(clave)) return;
    while (this.bloqueos.has(clave)) await this.bloqueos.get(clave);
    borrador.tenidos.add(clave);
    let soltar!: () => void;
    this.bloqueos.set(clave, new Promise<void>((resolver) => { soltar = resolver; }));
    borrador.soltar.push(() => { this.bloqueos.delete(clave); soltar(); });
  }

  private manager(borrador: Borrador) {
    const pausa = () => new Promise((resolver) => setImmediate(resolver));
    return {
      findOne: async (entidad: unknown, opciones: any) => {
        await pausa();
        const where = opciones.where;
        if (entidad === Demanda) {
          const comprometida = this.demandas.find((d) => d.origen === where.origen && d.demandaExternaId === where.demandaExternaId);
          if (!comprometida) return null;
          if (opciones.lock) await this.bloquear(`demanda:${comprometida.id}`, borrador);
          // Tras obtener el bloqueo se lee la última versión confirmada (READ COMMITTED).
          const actual = borrador.demandas.get(comprometida.id) ?? this.demandas.find((d) => d.id === comprometida.id)!;
          return { ...actual };
        }
        if (entidad === EventoInbox) {
          const filas = [...this.inbox.map((fila) => borrador.inbox.get(fila.id) ?? fila),
            ...[...borrador.inbox.values()].filter((fila) => !this.inbox.some((c) => c.id === fila.id))];
          const fila = filas.find((item) => (where.eventId ? item.eventId === where.eventId : item.id === where.id));
          if (fila && opciones.lock) await this.bloquear(`inbox:${fila.id}`, borrador);
          return fila ? { ...fila } : null;
        }
        return null;
      },
      save: async (entidad: unknown, valor: any) => {
        await pausa();
        if (entidad === Demanda) borrador.demandas.set(valor.id, { ...valor });
        if (entidad === EventoInbox) {
          if (this.fallarInboxUnaVez) {
            this.fallarInboxUnaVez = false;
            throw Object.assign(new Error('conexión con la base perdida'), { driverError: { code: '57P01' } });
          }
          if (!valor.id) {
            const repetido = this.inbox.some((fila) => fila.eventId === valor.eventId) ||
              [...borrador.inbox.values()].some((fila) => fila.eventId === valor.eventId);
            if (repetido) {
              throw Object.assign(new Error('duplicate key'), { driverError: { code: '23505', constraint: 'uq_eventos_inbox_event_id' } });
            }
            valor.id = String(this.idInbox++);
            valor.recibidoEn = new Date();
          }
          borrador.inbox.set(valor.id, { ...valor });
        }
        return valor;
      },
    };
  }

  readonly dataSource = {
    transaction: async (trabajo: (manager: unknown) => Promise<unknown>) => {
      this.transacciones += 1;
      const borrador: Borrador = { demandas: new Map(), inbox: new Map(), tenidos: new Set(), soltar: [] };
      try {
        const resultado = await trabajo(this.manager(borrador));
        for (const [id, demanda] of borrador.demandas) this.demandas[this.demandas.findIndex((d) => d.id === id)] = demanda;
        for (const [id, fila] of borrador.inbox) {
          const indice = this.inbox.findIndex((c) => c.id === id);
          if (indice >= 0) this.inbox[indice] = fila; else this.inbox.push(fila);
        }
        return resultado;
      } finally {
        borrador.soltar.forEach((soltar) => soltar());
      }
    },
    getRepository: () => ({
      find: async (opciones: any) => this.inbox
        .filter((fila) => fila.eventType === opciones.where.eventType && fila.estado === 'PENDIENTE' &&
          fila.intentos < config.retryMaxAttempts && fila.proximoIntentoEn !== null && fila.proximoIntentoEn <= new Date())
        .slice(0, opciones.take)
        .map((fila) => ({ id: fila.id })),
    }),
    createQueryBuilder: () => {
      let fila: Record<string, any>;
      const insert: any = {
        insert: () => insert, into: () => insert, orIgnore: () => insert,
        values: (valor: Record<string, any>) => { fila = valor; return insert; },
        // uq_demanda_rechazada_event_id con ON CONFLICT DO NOTHING
        execute: async () => {
          if (!fila.eventId || !this.rechazos.some((r) => r.eventId === fila.eventId)) this.rechazos.push(fila);
        },
      };
      return insert;
    },
  };
}

describe('ABC-367: criterios de aceptación de ABC-130 (prueba simulada)', () => {
  let base: BaseSimulada;
  let procesador: ProcesadorConfirmacionDemandaService;
  let consumidor: PubSubDemandaConfirmacionConsumerService;
  let mensajes: number;

  beforeEach(() => {
    base = new BaseSimulada();
    const procesadorDemanda = new ProcesadorDemandaService(base.dataSource as any);
    procesador = new ProcesadorConfirmacionDemandaService(base.dataSource as any, procesadorDemanda, config);
    consumidor = new PubSubDemandaConfirmacionConsumerService(procesador, null, config);
    mensajes = 0;
    jest.spyOn((consumidor as any).logger, 'log').mockImplementation(() => undefined);
    jest.spyOn((consumidor as any).logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn((consumidor as any).logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  function confirmacion(data: Record<string, unknown> = {}, cambios: Record<string, unknown> = {}) {
    return {
      ...DEMANDA_CONFIRMADA_V1_EJEMPLO,
      eventId: randomUUID(),
      correlationId: randomUUID(),
      ...cambios,
      data: { ...DEMANDA_CONFIRMADA_V1_EJEMPLO.data, ...data },
    };
  }

  // Entrega un mensaje como lo haría la suscripción y devuelve si hubo ACK o NACK.
  async function entregar(cuerpo: unknown) {
    const id = String(++mensajes);
    const resultado = { id, ack: false, nack: false };
    await consumidor.procesarMensaje({
      id,
      data: Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
      ack: () => { resultado.ack = true; },
      nack: () => { resultado.nack = true; },
    } as any);
    return resultado;
  }

  const demanda = (externa = 'PED-2026-0042') => base.demandas.find((d) => d.demandaExternaId === externa)!;
  const vencerReintentos = () => base.inbox.forEach((fila) => { if (fila.proximoIntentoEn) fila.proximoIntentoEn = new Date(Date.now() - 1); });

  describe('CA-01: correlación por origen e id externo, estado y fecha persistidos', () => {
    it('confirma la demanda RECIBIDA con la fecha del evento y su correlación', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      const evento = confirmacion();
      const entrega = await entregar(evento);
      expect(entrega).toMatchObject({ ack: true, nack: false });
      expect(demanda()).toMatchObject({
        estado: 'CONFIRMADA', confirmadaEn: new Date(evento.occurredAt),
        confirmacionEventId: evento.eventId, confirmacionCorrelationId: evento.correlationId,
      });
      expect(base.inbox).toEqual([expect.objectContaining({ eventId: evento.eventId, estado: 'PROCESADO', messageId: entrega.id })]);
    });

    it('no confirma una demanda de otro origen con el mismo id externo', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      await entregar(confirmacion({ origen: 'FACTURACION' }));
      expect(demanda().estado).toBe('RECIBIDA');
      expect(base.inbox[0]).toMatchObject({ estado: 'PENDIENTE' });
    });

    it('ignora espacios alrededor del id externo', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      await entregar(confirmacion({ demandaExternaId: '  PED-2026-0042 ' }));
      expect(demanda().estado).toBe('CONFIRMADA');
    });
  });

  describe('CA-03: una confirmación repetida tiene un único efecto y conserva el primer resultado', () => {
    it('la reentrega del mismo mensaje no cambia nada ni duplica el inbox', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      const evento = confirmacion();
      await entregar(evento);
      const primera = { ...demanda() };
      const segunda = await entregar(evento);
      expect(segunda.ack).toBe(true);
      expect(demanda()).toEqual(primera);
      expect(base.inbox).toHaveLength(1);
    });

    it('otra confirmación de la misma demanda queda IGNORADO y conserva fecha y evento de la primera', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      const primera = confirmacion();
      const posterior = confirmacion({}, { occurredAt: '2026-11-08T10:00:00.000Z' });
      await entregar(primera);
      await entregar(posterior);
      expect(demanda()).toMatchObject({ confirmacionEventId: primera.eventId, confirmadaEn: new Date(primera.occurredAt) });
      expect(base.inbox.map((fila) => fila.estado)).toEqual(['PROCESADO', 'IGNORADO']);
      expect(base.inbox[1].detalle).toContain(primera.eventId);
    });

    it('dos entregas simultáneas del mismo evento: una PROCESADO, otra DUPLICADO y un solo inbox', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      const evento = confirmacion();
      const resultados = await Promise.all([procesador.procesar(evento, 'a'), procesador.procesar(evento, 'b')]);
      expect(resultados.map((r) => r.resultado).sort()).toEqual(['DUPLICADO', 'PROCESADO']);
      expect(base.inbox).toHaveLength(1);
      expect(demanda().confirmacionEventId).toBe(evento.eventId);
    });

    it('dos confirmaciones distintas simultáneas: gana la que bloquea primero la demanda', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      const [a, b] = [confirmacion(), confirmacion()];
      const resultados = await Promise.all([procesador.procesar(a, 'a'), procesador.procesar(b, 'b')]);
      expect(resultados.map((r) => r.resultado).sort()).toEqual(['DUPLICADO', 'PROCESADO']);
      const ganador = resultados.find((r) => r.resultado === 'PROCESADO')!.eventId;
      expect(demanda().confirmacionEventId).toBe(ganador);
      expect(base.inbox.map((fila) => fila.estado).sort()).toEqual(['IGNORADO', 'PROCESADO']);
    });
  });

  describe('CA-04: confirmación anterior a la demanda', () => {
    it('queda PENDIENTE con ACK: no se pierde ni se descarta', async () => {
      const entrega = await entregar(confirmacion());
      expect(entrega).toMatchObject({ ack: true, nack: false });
      expect(base.inbox[0]).toMatchObject({ estado: 'PENDIENTE', intentos: 0, proximoIntentoEn: expect.any(Date) });
      expect(base.inbox[0].detalle).toContain('Pendiente de correlacion con VENTAS/PED-2026-0042');
      expect(base.rechazos).toEqual([]);
    });

    it('su reentrega mientras está pendiente no crea otra fila', async () => {
      const evento = confirmacion();
      await entregar(evento);
      await entregar(evento);
      expect(base.inbox).toHaveLength(1);
    });

    it('al llegar la demanda, el reproceso la confirma con la fecha y correlación del evento original', async () => {
      const evento = confirmacion();
      await entregar(evento);
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      vencerReintentos();
      await expect(procesador.reprocesarPendientes()).resolves.toBe(1);
      expect(demanda()).toMatchObject({
        estado: 'CONFIRMADA', confirmadaEn: new Date(evento.occurredAt), confirmacionEventId: evento.eventId,
      });
      expect(base.inbox[0]).toMatchObject({ estado: 'PROCESADO', intentos: 1, proximoIntentoEn: null, ultimoError: null });
    });

    it('el reproceso es acotado: tras el máximo queda PENDIENTE con motivo y no se reintenta más', async () => {
      await entregar(confirmacion());
      for (let intento = 0; intento < config.retryMaxAttempts; intento += 1) {
        vencerReintentos();
        await procesador.reprocesarPendientes();
      }
      expect(base.inbox[0]).toMatchObject({
        estado: 'PENDIENTE', intentos: config.retryMaxAttempts, proximoIntentoEn: null, ultimoError: 'DEMANDA_NO_REGISTRADA',
      });
      expect(base.inbox[0].detalle).toContain('Correlacion agotada');
      await expect(procesador.reprocesarPendientes()).resolves.toBe(0);
    });

    it('límite del diseño: si la demanda llega después de agotar los reintentos, la confirmación no se aplica sola', async () => {
      const evento = confirmacion();
      await entregar(evento);
      for (let intento = 0; intento < config.retryMaxAttempts; intento += 1) {
        vencerReintentos();
        await procesador.reprocesarPendientes();
      }
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      await expect(procesador.reprocesarPendientes()).resolves.toBe(0);
      await entregar(evento);
      expect(demanda().estado).toBe('RECIBIDA');
      expect(base.inbox[0].estado).toBe('PENDIENTE');
    });
  });

  describe('CA-05: mensajes inválidos y fallos transitorios', () => {
    it.each([
      ['origen fuera del contrato', { data: { origen: 'CRM' } }, 'data.origen'],
      ['id externo vacío', { data: { demandaExternaId: '   ' } }, 'data.demandaExternaId'],
      ['eventId que no es UUID', { eventId: 'evento-1' }, 'eventId'],
      ['fecha inválida', { occurredAt: 'ayer' }, 'occurredAt'],
      ['otro tipo de evento', { eventType: 'DemandaRegistrada.v1' }, 'eventType'],
    ])('%s: conserva el motivo, hace ACK y no toca la demanda', async (_caso, cambio, campo) => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      const { data, ...resto } = cambio as { data?: Record<string, unknown> };
      const entrega = await entregar(confirmacion(data ?? {}, resto));
      expect(entrega).toMatchObject({ ack: true, nack: false });
      expect(base.rechazos).toEqual([expect.objectContaining({ motivo: 'EVENTO_INVALIDO', messageId: entrega.id })]);
      expect(base.rechazos[0].detalle).toContain(campo);
      expect(demanda().estado).toBe('RECIBIDA');
      expect(base.inbox).toEqual([]);
    });

    it('JSON malformado: se registra el rechazo y se hace ACK para no reentregarlo sin fin', async () => {
      const entrega = await entregar('{no es json');
      expect(entrega).toMatchObject({ ack: true, nack: false });
      expect(base.rechazos).toEqual([expect.objectContaining({ motivo: 'EVENTO_INVALIDO', eventId: null })]);
    });

    it('mismo eventId con otro contenido: EVENTO_CONTRADICTORIO y la primera confirmación se conserva', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      const evento = confirmacion();
      await entregar(evento);
      const entrega = await entregar({ ...evento, data: { ...evento.data, demandaExternaId: 'PED-OTRA' } });
      expect(entrega.ack).toBe(true);
      expect(base.rechazos).toEqual([expect.objectContaining({ motivo: 'EVENTO_CONTRADICTORIO', eventId: evento.eventId })]);
      expect(demanda().confirmacionEventId).toBe(evento.eventId);
    });

    it('fallo transitorio a mitad de la transacción: rollback completo, NACK y la reentrega aplica una sola vez', async () => {
      base.registrarDemanda('VENTAS', 'PED-2026-0042');
      const evento = confirmacion();
      base.fallarInboxUnaVez = true;
      const primera = await entregar(evento);
      expect(primera).toMatchObject({ ack: false, nack: true });
      expect(demanda().estado).toBe('RECIBIDA');
      expect(base.inbox).toEqual([]);
      expect(base.rechazos).toEqual([]);

      const reentrega = await entregar(evento);
      expect(reentrega).toMatchObject({ ack: true, nack: false });
      expect(demanda()).toMatchObject({ estado: 'CONFIRMADA', confirmacionEventId: evento.eventId });
      expect(base.inbox).toHaveLength(1);
    });
  });
});
