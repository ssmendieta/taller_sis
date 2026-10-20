import { EntityManager } from 'typeorm';

import { OrdenProduccion } from './entities/orden-produccion.entity';
import { DisponibilidadSimuladaService } from './disponibilidad-simulada.service';

describe('Disponibilidad simulada (respuesta local sin Inventarios)', () => {
  const servicio = new DisponibilidadSimuladaService();
  const orden = { id: 42, codigo: 'ORD-42' } as OrdenProduccion;
  const materiales = [
    { material_id: '1', codigo: 'HAR-001', nombre: 'Harina', unidad_medida: 'kg', cantidad_requerida: '100.0000' },
    { material_id: '3', codigo: 'MAN-001', nombre: 'Manteca', unidad_medida: 'kg', cantidad_requerida: '50.0000' },
  ];

  function managerMock(ultima: any = null, itemsIniciales: any[] = []) {
    const guardadas: any[] = [];
    const manager = {
      query: jest.fn().mockResolvedValue(materiales),
      findOne: jest.fn().mockResolvedValue(ultima),
      find: jest.fn().mockResolvedValue(itemsIniciales),
      create: jest.fn((_entidad: unknown, datos: unknown) => datos),
      save: jest.fn(async (_entidad: unknown, datos: any) => {
        if (Array.isArray(datos)) {
          const guardados = datos.map((d, i) => ({ id: String(i + 1), ...d }));
          guardadas.push(...guardados);
          return guardados;
        }
        guardadas.push(datos);
        return { id: '1', ...datos };
      }),
    };
    return { manager: manager as unknown as EntityManager, llamadas: manager, guardadas };
  }

  it('el flag solo se activa con DISPONIBILIDAD_SIMULADA=true', () => {
    const original = process.env.DISPONIBILIDAD_SIMULADA;
    delete process.env.DISPONIBILIDAD_SIMULADA;
    expect(servicio.activada()).toBe(false);
    process.env.DISPONIBILIDAD_SIMULADA = 'TRUE';
    expect(servicio.activada()).toBe(true);
    process.env.DISPONIBILIDAD_SIMULADA = 'false';
    expect(servicio.activada()).toBe(false);
    if (original === undefined) delete process.env.DISPONIBILIDAD_SIMULADA;
    else process.env.DISPONIBILIDAD_SIMULADA = original;
  });

  it('crea la primera consulta respondida con el doble de lo requerido', async () => {
    const { manager, llamadas } = managerMock(null);
    const consulta = await servicio.responder(manager, orden);

    expect(consulta).toMatchObject({ consultaId: 'DISP-ORD-42-V1', ordenId: '42', estado: 'RESPONDIDA' });
    expect(consulta.vigenteEn).toBeInstanceOf(Date);

    const guardados = llamadas.save.mock.calls.filter(([, datos]) => Array.isArray(datos));
    const items = guardados[guardados.length - 1][1];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      materialCodigo: 'HAR-001', cantidadRequerida: '100.0000', cantidadDisponible: '200.0000', estado: 'SUFICIENTE',
    });
    expect(items[1]).toMatchObject({ cantidadDisponible: '100.0000', estado: 'SUFICIENTE' });
  });

  it('completa la consulta pendiente en lugar de crear otra', async () => {
    const pendiente = { id: '7', consultaId: 'DISP-ORD-42-V1', ordenId: '42', estado: 'PENDIENTE' };
    const items = [{ id: '1', materialId: '1', cantidadRequerida: '100.0000', cantidadDisponible: null, estado: null }];
    const { manager, llamadas } = managerMock(pendiente, items);

    const consulta = await servicio.responder(manager, orden);

    expect(consulta).toMatchObject({ id: '7', estado: 'RESPONDIDA' });
    // No se crea una consulta nueva: se completa la que ya estaba pendiente.
    expect(llamadas.create).not.toHaveBeenCalled();
    expect(items[0]).toMatchObject({ cantidadDisponible: '200.0000', estado: 'SUFICIENTE' });
  });

  it('no hace nada si la ultima consulta ya esta respondida', async () => {
    const respondida = { id: '7', ordenId: '42', estado: 'RESPONDIDA' };
    const { manager, llamadas } = managerMock(respondida);

    const consulta = await servicio.responder(manager, orden);

    expect(consulta).toBe(respondida);
    expect(llamadas.save).not.toHaveBeenCalled();
  });

  it('no responde si la orden no tiene materiales en la receta', async () => {
    const { manager, llamadas } = managerMock(null);
    llamadas.query.mockResolvedValue([]);

    expect(await servicio.responder(manager, orden)).toBeNull();
    expect(llamadas.save).not.toHaveBeenCalled();
  });
});
