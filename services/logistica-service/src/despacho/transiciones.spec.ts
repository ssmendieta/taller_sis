import { ConflictException } from '@nestjs/common';
import { EstadosDespachoEntrega1710000000006 } from '../database/migrations/1710000000006-EstadosDespachoEntrega';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { EstadoEntrega } from './estado-entrega.enum';
import {
  esTransicionEntregaValida,
  esTransicionRutaValida,
  estadoRutaSegunEntregas,
  validarDespacho,
  validarTransicionEntrega,
  validarTransicionRuta,
} from './transiciones';

const { PLANIFICADA, DESPACHADA, COMPLETADA, CANCELADA } = EstadoRuta;
const { PENDIENTE, ENTREGADA, ANULADA } = EstadoEntrega;

describe('ABC-375: transiciones de ruta', () => {
  it.each([
    [PLANIFICADA, DESPACHADA],
    [PLANIFICADA, CANCELADA],
    [DESPACHADA, COMPLETADA],
  ])('permite %s → %s', (actual, siguiente) => {
    expect(esTransicionRutaValida(actual, siguiente)).toBe(true);
    expect(() => validarTransicionRuta(actual, siguiente)).not.toThrow();
  });

  it.each([
    [PLANIFICADA, COMPLETADA],
    [DESPACHADA, PLANIFICADA],
    [DESPACHADA, CANCELADA],
    [COMPLETADA, DESPACHADA],
    [CANCELADA, PLANIFICADA],
  ])('rechaza %s → %s', (actual, siguiente) => {
    expect(esTransicionRutaValida(actual, siguiente)).toBe(false);
    expect(() => validarTransicionRuta(actual, siguiente)).toThrow(ConflictException);
  });

  it('rechaza repetir la misma transición (doble despacho)', () => {
    expect(() => validarTransicionRuta(DESPACHADA, DESPACHADA))
      .toThrow(new ConflictException('La ruta ya está en estado DESPACHADA'));
  });

  it('no despacha una ruta sin entregas pendientes', () => {
    expect(() => validarDespacho(PLANIFICADA, [ANULADA])).toThrow(ConflictException);
    expect(() => validarDespacho(PLANIFICADA, [])).toThrow(ConflictException);
    expect(() => validarDespacho(PLANIFICADA, [PENDIENTE, ANULADA])).not.toThrow();
    expect(() => validarDespacho(DESPACHADA, [PENDIENTE])).toThrow(ConflictException);
  });
});

describe('ABC-375: transiciones de entrega', () => {
  it('una entrega pendiente puede entregarse o anularse; las finales no cambian', () => {
    expect(esTransicionEntregaValida(PENDIENTE, ENTREGADA)).toBe(true);
    expect(esTransicionEntregaValida(PENDIENTE, ANULADA)).toBe(true);
    expect(esTransicionEntregaValida(ENTREGADA, ANULADA)).toBe(false);
    expect(esTransicionEntregaValida(ANULADA, ENTREGADA)).toBe(false);
  });

  it('solo se entrega con la ruta DESPACHADA', () => {
    expect(() => validarTransicionEntrega(DESPACHADA, PENDIENTE, ENTREGADA)).not.toThrow();
    expect(() => validarTransicionEntrega(PLANIFICADA, PENDIENTE, ENTREGADA)).toThrow(ConflictException);
    expect(() => validarTransicionEntrega(CANCELADA, PENDIENTE, ENTREGADA)).toThrow(ConflictException);
  });

  it('se anula solo mientras la ruta sigue activa', () => {
    expect(() => validarTransicionEntrega(PLANIFICADA, PENDIENTE, ANULADA)).not.toThrow();
    expect(() => validarTransicionEntrega(DESPACHADA, PENDIENTE, ANULADA)).not.toThrow();
    expect(() => validarTransicionEntrega(COMPLETADA, PENDIENTE, ANULADA)).toThrow(ConflictException);
  });

  it('rechaza entregar dos veces la misma parada', () => {
    expect(() => validarTransicionEntrega(DESPACHADA, ENTREGADA, ENTREGADA))
      .toThrow(new ConflictException('La entrega ya está en estado ENTREGADA'));
  });
});

describe('ABC-375: cierre de la ruta según sus entregas', () => {
  it('una entrega parcial no cierra la ruta', () => {
    expect(estadoRutaSegunEntregas([ENTREGADA, PENDIENTE, PENDIENTE])).toBe(DESPACHADA);
  });

  it('se completa cuando todas las entregas válidas están entregadas', () => {
    expect(estadoRutaSegunEntregas([ENTREGADA, ENTREGADA])).toBe(COMPLETADA);
  });

  it('las entregas anuladas no impiden ni cuentan para el cierre', () => {
    expect(estadoRutaSegunEntregas([ENTREGADA, ANULADA])).toBe(COMPLETADA);
    expect(estadoRutaSegunEntregas([ANULADA, ANULADA])).toBe(DESPACHADA);
  });
});

describe('ABC-375: migración de estados de despacho y entrega', () => {
  it('agrega solo los campos de estado, fecha y autor que faltaban', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new EstadosDespachoEntrega1710000000006().up({ query } as any);
    const sql = query.mock.calls.map(([s]) => s).join('\n');

    expect(sql).not.toContain('CREATE TABLE');
    expect(sql).toContain('ADD COLUMN despachada_en');
    expect(sql).toContain('ADD COLUMN despachada_por_usuario_id');
    expect(sql).toContain('ADD COLUMN completada_en');
    expect(sql).toContain("ADD COLUMN estado_entrega VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'");
    expect(sql).toContain('ADD COLUMN entrega_usuario_id');
    expect(sql).toContain('ck_ruta_parada_entrega_autor');
  });

  it('la reversión quita las columnas agregadas', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new EstadosDespachoEntrega1710000000006().down({ query } as any);
    const sql = query.mock.calls.map(([s]) => s).join('\n');
    expect(sql).toContain('DROP COLUMN estado_entrega');
    expect(sql).toContain('DROP COLUMN despachada_en');
  });
});
