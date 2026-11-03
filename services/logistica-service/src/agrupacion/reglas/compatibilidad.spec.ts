import { evaluarCompatibilidad, SolicitudAgrupable } from './compatibilidad';

const base = (id: string, cambios: Partial<SolicitudAgrupable> = {}): SolicitudAgrupable => ({
  id,
  estado: 'PREPARADA',
  destino: 'Zona Sur - Tienda Central',
  fechaRequerida: '2026-11-10',
  tipoCarga: 'Seca',
  unidadCarga: 'kg',
  ...cambios,
});

describe('ABC-360 evaluarCompatibilidad', () => {
  it('tres solicitudes compatibles pueden agruparse', () => {
    const resultado = evaluarCompatibilidad([base('1'), base('2'), base('3')]);
    expect(resultado).toEqual({ compatible: true, incompatibilidades: [] });
  });

  it('ignora mayúsculas y espacios repetidos en destino y tipo de carga', () => {
    const resultado = evaluarCompatibilidad([
      base('1'),
      base('2', { destino: '  zona sur -   TIENDA central ', tipoCarga: 'SECA' }),
    ]);
    expect(resultado.compatible).toBe(true);
  });

  it('rechaza una solicitud de otra zona', () => {
    const resultado = evaluarCompatibilidad([base('1'), base('2'), base('3', { destino: 'Zona Norte' })]);
    expect(resultado.compatible).toBe(false);
    expect(resultado.incompatibilidades).toEqual([{ solicitudId: '3', motivo: 'DESTINO_DISTINTO' }]);
  });

  it('rechaza una solicitud de otra fecha', () => {
    const resultado = evaluarCompatibilidad([base('1'), base('2', { fechaRequerida: '2026-11-11' })]);
    expect(resultado.incompatibilidades).toEqual([{ solicitudId: '2', motivo: 'FECHA_DISTINTA' }]);
  });

  it('rechaza tipo o unidad de carga distintos', () => {
    const resultado = evaluarCompatibilidad([
      base('1'),
      base('2', { tipoCarga: 'Refrigerada' }),
      base('3', { unidadCarga: 'unidad' }),
    ]);
    expect(resultado.incompatibilidades).toEqual([
      { solicitudId: '2', motivo: 'TIPO_CARGA_DISTINTO' },
      { solicitudId: '3', motivo: 'UNIDAD_CARGA_DISTINTA' },
    ]);
  });

  it('rechaza solicitudes anuladas o en un estado no agrupable', () => {
    const resultado = evaluarCompatibilidad([base('1'), base('2'), base('3', { estado: 'ANULADA' })]);
    expect(resultado.compatible).toBe(false);
    expect(resultado.incompatibilidades).toEqual([{ solicitudId: '3', motivo: 'ESTADO_NO_AGRUPABLE' }]);
  });

  it('rechaza datos incompletos o fechas inexistentes', () => {
    const resultado = evaluarCompatibilidad([
      base('1'),
      base('2', { destino: '   ' }),
      base('3', { fechaRequerida: '2026-02-30' }),
    ]);
    expect(resultado.incompatibilidades).toEqual([
      { solicitudId: '2', motivo: 'DATOS_INCOMPLETOS' },
      { solicitudId: '3', motivo: 'DATOS_INCOMPLETOS' },
    ]);
  });

  it('no cuenta dos veces la misma solicitud', () => {
    const resultado = evaluarCompatibilidad([base('1'), base('1')]);
    expect(resultado).toEqual({
      compatible: false,
      incompatibilidades: [{ solicitudId: '1', motivo: 'SOLICITUD_DUPLICADA' }],
    });
  });

  it('un grupo necesita al menos dos solicitudes válidas', () => {
    expect(evaluarCompatibilidad([base('1')]).compatible).toBe(false);
    expect(evaluarCompatibilidad([]).compatible).toBe(false);
  });
});
