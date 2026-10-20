import { Repository } from 'typeorm';
import { ConsultaDisponibilidad } from '../integraciones/disponibilidad/entities/consulta-disponibilidad.entity';
import { ConsultaDisponibilidadItem } from '../integraciones/disponibilidad/entities/consulta-disponibilidad-item.entity';
import { EventoOutbox } from '../integraciones/outbox/entities/evento-outbox.entity';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { OrdenesService } from './ordenes.service';

describe('ABC-278: solicitud asincrona de disponibilidad', () => {
  const orden = {
    id: 15, codigo: 'ORD-0015', producto_id: 2, cantidad: 10,
    fecha_programada: '2026-10-20', estado: 'PLANIFICADA',
  } as OrdenProduccion;

  function escenario(pendiente: ConsultaDisponibilidad | null = null, evento?: Partial<EventoOutbox>) {
    const outbox: Record<string, unknown>[] = [];
    const itemsGuardados: ConsultaDisponibilidadItem[] = [];
    const manager = {
      findOne: jest.fn(async (entity: unknown, options: { where: Record<string, unknown> }) => {
        if (entity === OrdenProduccion) return orden;
        if (entity === EventoOutbox) return evento ?? null;
        if (entity === ConsultaDisponibilidad && options.where.estado === 'PENDIENTE') return pendiente;
        if (entity === ConsultaDisponibilidad) return null;
        return null;
      }),
      find: jest.fn(async () => itemsGuardados),
      query: jest.fn(async () => [{
        material_id: '8', codigo: 'HAR-001', nombre: 'Harina de trigo',
        unidad_medida: 'kg', cantidad_requerida: '12.5000',
      }]),
      save: jest.fn(async (entity: unknown, value: any) => {
        if (entity === ConsultaDisponibilidad) return { id: '41', ...value };
        if (entity === ConsultaDisponibilidadItem) {
          const saved = value.map((item: ConsultaDisponibilidadItem, index: number) => ({
            id: String(91 + index), ...item,
          }));
          itemsGuardados.push(...saved);
          return saved;
        }
        if (entity === EventoOutbox) outbox.push(value);
        return value;
      }),
    };
    const repository = {
      manager: { transaction: jest.fn((callback: (value: typeof manager) => unknown) => callback(manager)) },
    } as unknown as Repository<OrdenProduccion>;
    const service = new OrdenesService(
      repository,
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue({ unidad_producto: 'unidad' }) } as any,
    );
    return { service, manager, outbox, itemsGuardados };
  }

  it('guarda consulta, items y evento outbox dentro de una transaccion', async () => {
    const ctx = escenario();

    const resultado = await ctx.service.solicitarDisponibilidadMateriales(15);

    expect(resultado).toMatchObject({
      estado_consulta: 'PENDIENTE', consulta_id: 'DISP-ORD-15-V1', consulta_version: 1,
      materiales: [expect.objectContaining({ material_id: 8, cantidad_requerida: 12.5 })],
    });
    expect(ctx.outbox).toHaveLength(1);
    expect(ctx.outbox[0]).toMatchObject({
      eventType: 'DisponibilidadMaterialSolicitada.v1',
      aggregateType: 'ConsultaDisponibilidad',
      aggregateId: '41',
      estado: 'PENDIENTE',
      payload: expect.objectContaining({
        eventType: 'DisponibilidadMaterialSolicitada.v1',
        data: expect.objectContaining({ consultaId: 'DISP-ORD-15-V1', ordenId: 15 }),
      }),
    });
  });

  it('reutiliza una consulta pendiente y no duplica el outbox', async () => {
    const consulta = {
      id: '41', consultaId: 'DISP-ORD-15-V1', consultaVersion: 1, ordenId: '15',
      requestEventId: 'd59541e7-d44c-4138-92e1-3432310cd1aa',
      correlationId: '67bfbe4d-9a02-4cb9-b707-d68434ba2c4a', estado: 'PENDIENTE',
      vigenteEn: null,
    } as ConsultaDisponibilidad;
    const ctx = escenario(consulta);

    await expect(ctx.service.solicitarDisponibilidadMateriales(15)).resolves.toMatchObject({
      consulta_id: consulta.consultaId, estado_consulta: 'PENDIENTE',
    });
    expect(ctx.manager.query).not.toHaveBeenCalled();
    expect(ctx.outbox).toHaveLength(0);
  });

  it.each(['PUBLICADO', 'PENDIENTE'])('reintenta un envío %s vencido con el mismo eventId y correlación', async (estado) => {
    const consulta = { id: '41', consultaId: 'DISP-ORD-15-V1', consultaVersion: 1, ordenId: '15',
      requestEventId: 'd59541e7-d44c-4138-92e1-3432310cd1aa',
      correlationId: '67bfbe4d-9a02-4cb9-b707-d68434ba2c4a', estado: 'PENDIENTE',
      respuestaEsperadaHasta: new Date(0), errorRespuesta: 'Respuesta inválida',
    } as ConsultaDisponibilidad;
    const evento = { eventId: consulta.requestEventId, correlationId: consulta.correlationId,
      estado: estado as EventoOutbox['estado'], ultimoError: 'Broker no disponible' };
    const ctx = escenario(consulta, evento);
    const respuesta = await ctx.service.solicitarDisponibilidadMateriales(15);
    expect(respuesta).toMatchObject({ request_event_id: consulta.requestEventId,
      correlation_id: consulta.correlationId, error_respuesta: null, publicacion: { estado: 'PENDIENTE', ultimo_error: null } });
    expect(ctx.manager.query).not.toHaveBeenCalled();
    expect(ctx.outbox).toHaveLength(1);
    expect(ctx.outbox[0].eventId).toBe(consulta.requestEventId);
  });

  it('un doble clic no toma un evento cuyo publicador tiene un lease activo', async () => {
    const consulta = { id: '41', consultaId: 'DISP-ORD-15-V1', estado: 'PENDIENTE',
      requestEventId: 'd59541e7-d44c-4138-92e1-3432310cd1aa', respuestaEsperadaHasta: new Date(0),
    } as ConsultaDisponibilidad;
    const ctx = escenario(consulta, { estado: 'PROCESANDO' });
    await ctx.service.solicitarDisponibilidadMateriales(15);
    expect(ctx.manager.save).not.toHaveBeenCalled();
  });
});
