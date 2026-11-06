import { calcularPrioridad, ordenarPorPrioridad, SolicitudPriorizable } from './prioridad';

const HOY = '2026-11-03';

describe('ABC-361 prioridad de solicitudes', () => {
  it('expone días restantes y nivel sin modificar la solicitud', () => {
    const solicitud: SolicitudPriorizable = { id: '7', prioridad: 'BAJA', fechaRequerida: '2026-11-10' };
    const copia = { ...solicitud };
    expect(calcularPrioridad(solicitud, HOY)).toEqual({
      solicitudId: '7', nivel: 'BAJA', diasRestantes: 7, fechaRequerida: '2026-11-10',
    });
    expect(solicitud).toEqual(copia);
  });

  it('sin prioridad explícita se considera MEDIA', () => {
    expect(calcularPrioridad({ id: '1', fechaRequerida: '2026-11-20' }, HOY).nivel).toBe('MEDIA');
  });

  it('una solicitud que vence mañana o ya venció es URGENTE aunque sea BAJA', () => {
    expect(calcularPrioridad({ id: '1', prioridad: 'BAJA', fechaRequerida: '2026-11-04' }, HOY).nivel).toBe('URGENTE');
    expect(calcularPrioridad({ id: '2', prioridad: 'BAJA', fechaRequerida: '2026-11-01' }, HOY)).toMatchObject({
      nivel: 'URGENTE', diasRestantes: -2,
    });
  });

  it('ordena por nivel, luego por fecha más próxima y desempata por id', () => {
    const orden = ordenarPorPrioridad([
      { id: '10', prioridad: 'BAJA', fechaRequerida: '2026-11-08' },
      { id: '3', prioridad: 'ALTA', fechaRequerida: '2026-11-20' },
      { id: '9', prioridad: 'ALTA', fechaRequerida: '2026-11-07' },
      { id: '2', prioridad: 'ALTA', fechaRequerida: '2026-11-07' },
      { id: '5', prioridad: 'MEDIA', fechaRequerida: '2026-11-04' },
    ], HOY).map((p) => p.solicitudId);
    expect(orden).toEqual(['5', '2', '9', '3', '10']);
  });

  it('compara ids numéricos por valor y no como texto', () => {
    const orden = ordenarPorPrioridad([
      { id: '10', fechaRequerida: '2026-11-10' },
      { id: '9', fechaRequerida: '2026-11-10' },
    ], HOY).map((p) => p.solicitudId);
    expect(orden).toEqual(['9', '10']);
  });

  it('las mismas solicitudes y fecha de referencia dan el mismo orden en cualquier orden de entrada', () => {
    const solicitudes: SolicitudPriorizable[] = [
      { id: '1', prioridad: 'MEDIA', fechaRequerida: '2026-11-09' },
      { id: '2', prioridad: 'ALTA', fechaRequerida: '2026-11-12' },
      { id: '3', prioridad: 'BAJA', fechaRequerida: '2026-11-04' },
      { id: '4', prioridad: 'MEDIA', fechaRequerida: '2026-11-09' },
    ];
    const esperado = ordenarPorPrioridad(solicitudes, HOY);
    expect(ordenarPorPrioridad([...solicitudes].reverse(), HOY)).toEqual(esperado);
    expect(esperado.map((p) => p.solicitudId)).toEqual(['3', '2', '1', '4']);
  });

  it('no altera la lista recibida', () => {
    const solicitudes: SolicitudPriorizable[] = [
      { id: '2', fechaRequerida: '2026-11-09' },
      { id: '1', fechaRequerida: '2026-11-09' },
    ];
    ordenarPorPrioridad(solicitudes, HOY);
    expect(solicitudes.map((s) => s.id)).toEqual(['2', '1']);
  });

  it('rechaza fechas inválidas', () => {
    expect(() => calcularPrioridad({ id: '1', fechaRequerida: '2026-13-01' }, HOY)).toThrow(RangeError);
    expect(() => calcularPrioridad({ id: '1', fechaRequerida: '2026-11-10' }, 'ayer')).toThrow(RangeError);
  });
});
