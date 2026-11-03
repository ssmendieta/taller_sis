import { DEMANDA_REGISTRADA_V1_EJEMPLO } from '../integraciones/contratos/ventas-demanda-v1';
import { EventoDemandaV1InvalidoError } from '../integraciones/contratos/ventas-demanda-v1.validator';
import { EventoInbox } from '../integraciones/inbox/entities/evento-inbox.entity';
import { DemandasRechazadas1710000000025 } from '../database/migrations/1710000000025-DemandasRechazadas';
import { Demanda } from './entities/demanda.entity';
import { DemandaRechazada } from './entities/demanda-rechazada.entity';
import {
  ConflictoDemandaContradictoriaError,
  esErrorPermanenteDemanda,
  hashContenido,
  ProcesadorDemandaService,
} from './procesador-demanda.service';
import { validarDemandaRegistradaV1 } from './validar-demanda';

const UUID2 = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const evento = (cambios: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => {
  const base = JSON.parse(JSON.stringify(DEMANDA_REGISTRADA_V1_EJEMPLO));
  return { ...base, ...cambios, data: { ...base.data, ...data } };
};

describe('ABC-357: reglas de negocio de la demanda', () => {
  it('normaliza textos y cantidades para comparar el mismo pedido escrito distinto', () => {
    const validado = validarDemandaRegistradaV1(evento({}, {
      demandaExternaId: ' PED-2026-0042 ',
      items: [{ productoCodigo: ' GAL-001 ', cantidad: '40', unidad: 'kg' }],
    }));
    expect(validado.data).toEqual({
      origen: 'VENTAS', demandaExternaId: 'PED-2026-0042', fechaRequerida: '2026-11-15',
      items: [{ productoCodigo: 'GAL-001', cantidad: '40.0000', unidad: 'kg' }],
    });
  });

  it.each([
    ['origen desconocido', { origen: 'CRM' }, 'data.origen'],
    ['fecha inexistente', { fechaRequerida: '2026-02-30' }, 'data.fechaRequerida'],
    ['fecha con mes 13', { fechaRequerida: '2026-13-01' }, 'data.fechaRequerida'],
    ['cantidad cero', { items: [{ productoCodigo: 'A', cantidad: '0', unidad: 'kg' }] }, 'cantidad'],
    ['cantidad negativa', { items: [{ productoCodigo: 'A', cantidad: '-5', unidad: 'kg' }] }, 'cantidad'],
    ['cantidad numérica en vez de texto', { items: [{ productoCodigo: 'A', cantidad: 5, unidad: 'kg' }] }, 'cantidad'],
    ['más de 4 decimales', { items: [{ productoCodigo: 'A', cantidad: '1.12345', unidad: 'kg' }] }, 'cantidad'],
    ['unidad desconocida', { items: [{ productoCodigo: 'A', cantidad: '1', unidad: 'cajas' }] }, 'unidad'],
    ['producto vacío', { items: [{ productoCodigo: ' ', cantidad: '1', unidad: 'kg' }] }, 'productoCodigo'],
    ['producto repetido', { items: [
      { productoCodigo: 'A', cantidad: '1', unidad: 'kg' }, { productoCodigo: 'A', cantidad: '2', unidad: 'kg' },
    ] }, 'productoCodigo'],
  ])('rechaza %s', (_caso, data, campo) => {
    try {
      validarDemandaRegistradaV1(evento({}, data));
      throw new Error('debía rechazar');
    } catch (error) {
      expect(error).toBeInstanceOf(EventoDemandaV1InvalidoError);
      expect((error as EventoDemandaV1InvalidoError).errores.map((e) => e.campo).join(' ')).toContain(campo);
    }
  });
});

describe('ABC-357: idempotencia por id externo', () => {
  let manager: any;
  let dataSource: any;
  let existente: Partial<Demanda> | null;
  let rechazos: any[];
  let service: ProcesadorDemandaService;

  beforeEach(() => {
    existente = null;
    rechazos = [];
    manager = {
      findOne: jest.fn(async (entity: unknown) => entity === EventoInbox ? null : existente),
      create: jest.fn((_e: unknown, value: unknown) => value),
      save: jest.fn(async (entity: unknown, value: any) => entity === Demanda ? { id: '10', ...value } : value),
    };
    const insert = { into: () => insert, values: (v: any) => { rechazos.push(v); return insert; }, orIgnore: () => insert, execute: jest.fn() };
    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
      createQueryBuilder: () => ({ insert: () => insert }),
    };
    service = new ProcesadorDemandaService(dataSource);
  });

  const contenido = (data: Record<string, unknown> = {}) =>
    hashContenido(validarDemandaRegistradaV1(evento({}, data)).data);

  it('bloquea la demanda existente al buscarla dentro de la transacción', async () => {
    await service.procesar(evento());
    expect(manager.findOne).toHaveBeenCalledWith(Demanda, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });

  it('el mismo pedido con otro eventId devuelve la misma demanda sin crear otra', async () => {
    existente = { id: '10', eventId: DEMANDA_REGISTRADA_V1_EJEMPLO.eventId, contenidoHash: contenido() };
    const resultado = await service.procesar(evento({ eventId: UUID2 }, {
      items: [{ productoCodigo: 'GAL-001', cantidad: '40', unidad: 'kg' }, { productoCodigo: 'PAN-001', cantidad: '120.0', unidad: 'unidad' }],
    }), 'msg-9');
    expect(resultado).toEqual({ resultado: 'DUPLICADO', eventId: UUID2, demandaId: '10' });
    expect(manager.save.mock.calls.map(([e]: [unknown]) => e)).toEqual([EventoInbox]);
    expect(manager.save.mock.calls[0][1]).toMatchObject({ estado: 'IGNORADO', messageId: 'msg-9' });
  });

  it('un pedido contradictorio se rechaza sin alterar la demanda válida y queda trazado', async () => {
    existente = { id: '10', eventId: DEMANDA_REGISTRADA_V1_EJEMPLO.eventId, contenidoHash: contenido() };
    const contradictorio = evento({ eventId: UUID2 }, { fechaRequerida: '2026-11-20' });
    await expect(service.procesar(contradictorio, 'msg-7')).rejects.toBeInstanceOf(ConflictoDemandaContradictoriaError);
    expect(manager.save).not.toHaveBeenCalled();
    expect(rechazos).toEqual([expect.objectContaining({
      eventId: UUID2, origen: 'VENTAS', demandaExternaId: 'PED-2026-0042', motivo: 'DEMANDA_CONTRADICTORIA', messageId: 'msg-7',
    })]);
    expect(esErrorPermanenteDemanda(new ConflictoDemandaContradictoriaError('VENTAS', 'X', '1'))).toBe(true);
  });

  it('un evento inválido registra el motivo del rechazo', async () => {
    await expect(service.procesar(evento({}, { origen: 'CRM' }), 'msg-3')).rejects.toBeInstanceOf(EventoDemandaV1InvalidoError);
    expect(rechazos[0]).toMatchObject({ motivo: 'EVENTO_INVALIDO', origen: 'CRM' });
    expect(rechazos[0].detalle).toContain('data.origen');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('dos entregas concurrentes: la que choca con la unicidad de la demanda se reintenta como duplicado', async () => {
    const choque = Object.assign(new Error('duplicate key'), { driverError: { code: '23505', constraint: 'uq_demanda_origen_externa' } });
    dataSource.transaction = jest.fn()
      .mockRejectedValueOnce(choque)
      .mockImplementation(async (cb: any) => {
        existente = { id: '10', eventId: UUID2, contenidoHash: contenido() };
        return cb(manager);
      });
    await expect(service.procesar(evento())).resolves.toMatchObject({ resultado: 'DUPLICADO', demandaId: '10' });
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });

  it('un fallo transitorio no se registra como rechazo', async () => {
    dataSource.transaction = jest.fn().mockRejectedValue(new Error('connection terminated'));
    await expect(service.procesar(evento())).rejects.toThrow('connection terminated');
    expect(rechazos).toEqual([]);
  });
});

describe('ABC-357: migración de rechazos', () => {
  it('crea la tabla de trazas con índice único parcial por eventId', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new DemandasRechazadas1710000000025().up({ query } as any);
    const sql = query.mock.calls.map(([s]) => s).join('\n');
    expect(sql).toContain('CREATE TABLE demandas_rechazadas');
    expect(sql).toContain('WHERE event_id IS NOT NULL');
    expect(DemandaRechazada).toBeDefined();
  });
});
