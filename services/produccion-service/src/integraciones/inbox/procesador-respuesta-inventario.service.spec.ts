import { DataSource } from 'typeorm';
import {
  SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO,
  SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
} from '../contratos/inventario-almacen-v1';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { SolicitudMaterial } from '../../solicitudes-material/entities/solicitud-material.entity';
import { ESTADO_INBOX_IGNORADO, ESTADO_INBOX_PROCESADO, EventoInbox } from './entities/evento-inbox.entity';
import {
  ConflictoIntegridadInboxError,
  ProcesadorRespuestaInventarioService,
} from './procesador-respuesta-inventario.service';

function escenario(version = 1, estado = 'PENDIENTE') {
  const inbox = new Map<string, EventoInbox>();
  const solicitud = {
    id: '27', ordenId: '15', estado, solicitudVersion: version,
    estadoActualizadoEn: null, motivoEstado: null,
  } as SolicitudMaterial;
  const original = {
    eventId: SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO.eventId,
    eventType: SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO.eventType,
    aggregateType: 'SolicitudMaterial', aggregateId: '27',
    payload: structuredClone(SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO),
  } as EventoOutbox;
  const manager = {
    findOne: jest.fn(async (entity: unknown, options: { where: { eventId?: string } }) => {
      if (entity === EventoInbox) return inbox.get(options.where.eventId!) ?? null;
      if (entity === EventoOutbox) return original;
      if (entity === SolicitudMaterial) return solicitud;
      return null;
    }),
    save: jest.fn(async (entity: unknown, value: Record<string, unknown>) => {
      if (entity === EventoInbox) inbox.set(String(value.eventId), value as unknown as EventoInbox);
      if (entity === SolicitudMaterial) Object.assign(solicitud, value);
      return value;
    }),
  };
  const dataSource = {
    transaction: jest.fn((callback: (value: typeof manager) => unknown) => callback(manager)),
    getRepository: jest.fn(() => ({
      findOneByOrFail: jest.fn(({ eventId }: { eventId: string }) => inbox.get(eventId)),
    })),
  } as unknown as DataSource;
  return { service: new ProcesadorRespuestaInventarioService(dataSource), inbox, solicitud, manager };
}

describe('ABC-244: procesador idempotente de respuestas de almacen', () => {
  it('actualiza la solicitud y registra el inbox en la misma transaccion', async () => {
    const ctx = escenario();
    const evento = structuredClone(SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO);

    await expect(ctx.service.procesar(evento, 'mensaje-google-1')).resolves.toMatchObject({
      resultado: 'PROCESADO', eventId: evento.eventId, solicitudId: '27',
    });
    expect(ctx.solicitud).toMatchObject({ estado: 'APROBADA', solicitudVersion: 2 });
    expect(ctx.inbox.get(evento.eventId)).toMatchObject({
      estado: ESTADO_INBOX_PROCESADO, messageId: 'mensaje-google-1',
    });
  });

  it('reconoce la redelivery exacta sin repetir el efecto', async () => {
    const ctx = escenario();
    const evento = structuredClone(SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO);

    await ctx.service.procesar(evento, 'mensaje-google-1');
    await expect(ctx.service.procesar(evento, 'mensaje-google-1')).resolves.toMatchObject({
      resultado: 'DUPLICADO',
    });
    expect(ctx.manager.save.mock.calls.filter(([entity]) => entity === SolicitudMaterial)).toHaveLength(1);
  });

  it('rechaza el mismo eventId si el contenido cambia', async () => {
    const ctx = escenario();
    const evento = structuredClone(SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO);
    await ctx.service.procesar(evento);
    const alterado = structuredClone(evento);
    alterado.data.motivo = 'contenido alterado';

    await expect(ctx.service.procesar(alterado)).rejects.toBeInstanceOf(ConflictoIntegridadInboxError);
    expect(ctx.solicitud.estado).toBe('APROBADA');
  });

  it('registra e ignora una version que no supera la aplicada', async () => {
    const ctx = escenario(3, 'APROBADA');
    const evento = structuredClone(SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO);

    await expect(ctx.service.procesar(evento)).resolves.toMatchObject({ resultado: 'IGNORADO' });
    expect(ctx.inbox.get(evento.eventId)).toMatchObject({ estado: ESTADO_INBOX_IGNORADO });
    expect(ctx.manager.save.mock.calls.some(([entity]) => entity === SolicitudMaterial)).toBe(false);
  });

  it('rechaza una respuesta que no correlaciona con el evento original', async () => {
    const ctx = escenario();
    const evento = structuredClone(SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO);
    evento.correlationId = '8a63816a-4375-42ff-ac9f-3b606188e76e';

    await expect(ctx.service.procesar(evento)).rejects.toThrow('correlationId');
    expect(ctx.manager.save).not.toHaveBeenCalled();
  });
});
