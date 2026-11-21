import { DEMANDA_ATENDIDA_V1_EJEMPLO } from './ventas-demanda-atendida-v1';
import {
  DemandaAtendidaV1InvalidoError,
  validarDemandaAtendidaV1,
} from './ventas-demanda-atendida-v1.validator';

function copia(): any {
  return JSON.parse(JSON.stringify(DEMANDA_ATENDIDA_V1_EJEMPLO));
}

function campos(evento: unknown): string[] {
  try {
    validarDemandaAtendidaV1(evento);
  } catch (error) {
    expect(error).toBeInstanceOf(DemandaAtendidaV1InvalidoError);
    return (error as DemandaAtendidaV1InvalidoError).errores.map((e) => e.campo);
  }
  throw new Error('Se esperaba un error de validacion');
}

describe('ABC-431: contrato DemandaAtendida v1', () => {
  it('acepta el ejemplo documentado', () => {
    expect(validarDemandaAtendidaV1(DEMANDA_ATENDIDA_V1_EJEMPLO))
      .toBe(DEMANDA_ATENDIDA_V1_EJEMPLO);
  });

  it('acepta origen FACTURACION', () => {
    const evento = copia();
    evento.data.origen = 'FACTURACION';
    expect(() => validarDemandaAtendidaV1(evento)).not.toThrow();
  });

  it.each(['demandaId', 'origen', 'demandaExternaId', 'items', 'fechaAtencion'])(
    'rechaza el mensaje sin data.%s',
    (campo) => {
      const evento = copia();
      delete evento.data[campo];
      expect(campos(evento)).toEqual([`data.${campo}`]);
    },
  );

  it.each(['eventId', 'eventType', 'occurredAt', 'source', 'correlationId', 'data'])(
    'rechaza el mensaje sin %s',
    (campo) => {
      const evento = copia();
      delete evento[campo];
      expect(campos(evento)).toContain(campo);
    },
  );

  it.each(['productoCodigo', 'cantidadAtendida', 'unidad'])(
    'rechaza un item sin %s',
    (campo) => {
      const evento = copia();
      delete evento.data.items[0][campo];
      expect(campos(evento)).toEqual([`data.items[0].${campo}`]);
    },
  );

  it('rechaza una version distinta de v1', () => {
    const evento = copia();
    evento.eventType = 'DemandaAtendida.v2';
    expect(campos(evento)).toEqual(['eventType']);
  });

  it('rechaza un source distinto de produccion-service', () => {
    const evento = copia();
    evento.source = 'otro-service';
    expect(campos(evento)).toEqual(['source']);
  });

  it('rechaza un eventId que no es UUID', () => {
    const evento = copia();
    evento.eventId = 'no-es-uuid';
    expect(campos(evento)).toEqual(['eventId']);
  });

  it.each(['0', '0.0000', '-1', '1.12345', 'abc', '10000000000'])(
    'rechaza cantidadAtendida %s',
    (cantidad) => {
      const evento = copia();
      evento.data.items[0].cantidadAtendida = cantidad;
      expect(campos(evento)).toEqual(['data.items[0].cantidadAtendida']);
    },
  );

  it('rechaza una cantidad enviada como numero', () => {
    const evento = copia();
    evento.data.items[0].cantidadAtendida = 10;
    expect(campos(evento)).toEqual(['data.items[0].cantidadAtendida']);
  });

  it('rechaza items vacio o que no es lista', () => {
    const vacio = copia();
    vacio.data.items = [];
    expect(campos(vacio)).toEqual(['data.items']);
    const objeto = copia();
    objeto.data.items = {};
    expect(campos(objeto)).toEqual(['data.items']);
  });

  it('rechaza un item que no es objeto', () => {
    const evento = copia();
    evento.data.items = ['x'];
    expect(campos(evento)).toEqual(['data.items[0]']);
  });

  it('rechaza un producto repetido', () => {
    const evento = copia();
    evento.data.items[1].productoCodigo = evento.data.items[0].productoCodigo;
    expect(campos(evento)).toEqual(['data.items[1].productoCodigo']);
  });

  it('rechaza textos demasiado largos', () => {
    const evento = copia();
    evento.data.demandaExternaId = 'x'.repeat(81);
    evento.data.items[0].productoCodigo = 'x'.repeat(81);
    evento.data.items[0].unidad = 'x'.repeat(21);
    expect(campos(evento)).toEqual([
      'data.demandaExternaId',
      'data.items[0].productoCodigo',
      'data.items[0].unidad',
    ]);
  });

  it.each(['0', '-3', '1.5', 'abc', '9223372036854775808'])(
    'rechaza demandaId %s',
    (id) => {
      const evento = copia();
      evento.data.demandaId = id;
      expect(campos(evento)).toEqual(['data.demandaId']);
    },
  );

  it('rechaza un origen fuera de la lista', () => {
    const evento = copia();
    evento.data.origen = 'MARKETPLACE';
    expect(campos(evento)).toEqual(['data.origen']);
  });

  it.each(['2026-11-20T15:29:58', '2026-11-20', '2026-02-30T10:00:00Z', 'ayer'])(
    'rechaza fechaAtencion %s',
    (fecha) => {
      const evento = copia();
      evento.data.fechaAtencion = fecha;
      expect(campos(evento)).toEqual(['data.fechaAtencion']);
    },
  );

  it.each([null, 'texto', 42, []])('rechaza un mensaje que no es objeto: %j', (valor) => {
    expect(campos(valor)).toEqual(['$']);
  });

  it('informa eventType y eventId en el error cuando existen', () => {
    const evento = copia();
    delete evento.data;
    try {
      validarDemandaAtendidaV1(evento);
      throw new Error('Se esperaba un error');
    } catch (error) {
      const e = error as DemandaAtendidaV1InvalidoError;
      expect(e.codigo).toBe('DEMANDA_ATENDIDA_V1_INVALIDO');
      expect(e.eventType).toBe('DemandaAtendida.v1');
      expect(e.eventId).toBe(evento.eventId);
    }
  });
});
