import { DataSource } from 'typeorm';
import {
  DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO,
  DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO,
} from '../contratos/inventario-almacen-v1';
import { ConsultaDisponibilidad } from '../disponibilidad/entities/consulta-disponibilidad.entity';
import { ConsultaDisponibilidadItem } from '../disponibilidad/entities/consulta-disponibilidad-item.entity';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { ESTADO_INBOX_IGNORADO, ESTADO_INBOX_PROCESADO, EventoInbox } from './entities/evento-inbox.entity';
import { ProcesadorRespuestaInventarioService } from './procesador-respuesta-inventario.service';

function escenario(ultimaId = '41') {
  const inbox = new Map<string, EventoInbox>();
  const consulta = {
    id: '41', consultaId: 'DISP-ORD-0015-V1', consultaVersion: 1, ordenId: '15',
    requestEventId: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO.eventId,
    correlationId: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO.correlationId,
    estado: 'PENDIENTE', responseEventId: null, vigenteEn: null,
  } as ConsultaDisponibilidad;
  const ultima = ultimaId === consulta.id
    ? consulta
    : { ...consulta, id: ultimaId, consultaId: 'DISP-ORD-0015-V2', consultaVersion: 2 };
  const items = [{
    id: '91', consultaDisponibilidadId: consulta.id, materialId: '8',
    materialCodigo: 'HAR-001', materialNombre: 'Harina de trigo',
    cantidadRequerida: '12.5000', cantidadDisponible: null, unidad: 'kg', estado: null,
  }] as ConsultaDisponibilidadItem[];
  const original = {
    eventId: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO.eventId,
    eventType: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO.eventType,
    aggregateType: 'ConsultaDisponibilidad', aggregateId: consulta.id,
    payload: structuredClone(DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO),
  } as EventoOutbox;
  const manager = {
    findOne: jest.fn(async (entity: unknown, options: { where: Record<string, unknown> }) => {
      if (entity === EventoInbox) return inbox.get(String(options.where.eventId)) ?? null;
      if (entity === EventoOutbox) return original;
      if (entity === ConsultaDisponibilidad) {
        if (options.where.requestEventId) return Object.entries(options.where)
          .every(([key, value]) => (consulta as any)[key] === value) ? consulta : null;
        return options.where.id ? consulta : ultima;
      }
      return null;
    }),
    find: jest.fn(async (entity: unknown) => entity === ConsultaDisponibilidadItem ? items : []),
    save: jest.fn(async (entity: unknown, value: any) => {
      if (entity === EventoInbox) inbox.set(String(value.eventId), value);
      if (entity === ConsultaDisponibilidad) Object.assign(consulta, value);
      return value;
    }),
  };
  const dataSource = {
    transaction: jest.fn((callback: (value: typeof manager) => unknown) => callback(manager)),
    getRepository: jest.fn(() => ({
      findOneByOrFail: jest.fn(({ eventId }: { eventId: string }) => inbox.get(eventId)),
    })),
  } as unknown as DataSource;
  return {
    service: new ProcesadorRespuestaInventarioService(dataSource),
    consulta, items, inbox, manager,
  };
}

describe('ABC-278: procesamiento idempotente de disponibilidad', () => {
  it('persiste el snapshot y el inbox en la misma transaccion', async () => {
    const ctx = escenario();
    const evento = structuredClone(DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO);

    await expect(ctx.service.procesar(evento, 'mensaje-disponibilidad-1')).resolves.toMatchObject({
      resultado: 'PROCESADO', consultaId: evento.data.consultaId,
    });
    expect(ctx.consulta).toMatchObject({
      estado: 'RESPONDIDA', responseEventId: evento.eventId,
    });
    expect(ctx.items[0]).toMatchObject({ cantidadDisponible: '20.0000', estado: 'SUFICIENTE' });
    expect(ctx.inbox.get(evento.eventId)).toMatchObject({
      estado: ESTADO_INBOX_PROCESADO, messageId: 'mensaje-disponibilidad-1',
    });
  });

  it('reconoce una redelivery exacta sin volver a modificar el snapshot', async () => {
    const ctx = escenario();
    const evento = structuredClone(DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO);
    await ctx.service.procesar(evento);

    await expect(ctx.service.procesar(evento)).resolves.toMatchObject({ resultado: 'DUPLICADO' });
    expect(ctx.manager.save.mock.calls.filter(([entity]) => entity === ConsultaDisponibilidad)).toHaveLength(1);
  });

  it('registra como ignorada una respuesta de una consulta que ya no es vigente', async () => {
    const ctx = escenario('42');
    const evento = structuredClone(DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO);

    await expect(ctx.service.procesar(evento)).resolves.toMatchObject({ resultado: 'IGNORADO' });
    expect(ctx.consulta.estado).toBe('PENDIENTE');
    expect(ctx.inbox.get(evento.eventId)).toMatchObject({ estado: ESTADO_INBOX_IGNORADO });
  });

  it('conserva pendiente una respuesta inválida correlacionada y no guarda cantidades parciales', async () => {
    const ctx = escenario();
    const evento = structuredClone(DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO);
    evento.data.materiales[0].cantidadDisponible = '-1.0000';
    await expect(ctx.service.procesar(evento)).rejects.toThrow();
    expect(ctx.consulta.estado).toBe('PENDIENTE');
    expect(ctx.consulta.errorRespuesta).toContain('respuesta no válida');
    expect(ctx.items[0].cantidadDisponible).toBeNull();
    expect(ctx.inbox.size).toBe(0);
  });

  it.each(['correlationId', 'ordenId', 'consultaId', 'consultaVersion', 'requestEventId'])('no asocia errores ni cantidades con otra %s', async (campo) => {
    const ctx = escenario();
    const evento = structuredClone(DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO);
    if (campo === 'correlationId') evento.correlationId = '11111111-1111-4111-8111-111111111111';
    else (evento.data as any)[campo] = typeof (evento.data as any)[campo] === 'number' ? 999 : '11111111-1111-4111-8111-111111111111';
    await expect(ctx.service.procesar(evento)).rejects.toThrow();
    expect(ctx.consulta.errorRespuesta).toBeUndefined();
    expect(ctx.consulta.estado).toBe('PENDIENTE');
    expect(ctx.items[0].cantidadDisponible).toBeNull();
  });
});
