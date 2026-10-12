import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import {
  CalidadService,
  PERMISO_CONSULTAR_CONFORMES,
} from './calidad.service';

describe('ABC-208: respuesta interna de conformes', () => {
  const query = jest.fn();
  const service = new CalidadService({ query } as unknown as Repository<OrdenProduccion>);

  beforeEach(() => query.mockReset());

  it('expone orden, producto, unidad, conformes, version, fecha y permiso', async () => {
    query.mockResolvedValue([{
      orden_id: 15,
      orden_codigo: 'ORD-0015',
      producto_id: 3,
      producto_codigo: 'PAN-001',
      producto_nombre: 'Pan integral',
      unidad: 'unidad',
      cantidad_conforme: '30.5000',
      version: '2',
      fecha: new Date('2026-10-11T15:30:00.000Z'),
    }]);

    await expect(service.consultarConformes(15)).resolves.toEqual({
      ordenId: 15,
      ordenCodigo: 'ORD-0015',
      producto: {
        id: 3,
        codigo: 'PAN-001',
        nombre: 'Pan integral',
        unidad: 'unidad',
      },
      cantidadConforme: '30.5000',
      version: 2,
      fecha: '2026-10-11T15:30:00.000Z',
      permisoRequerido: PERMISO_CONSULTAR_CONFORMES,
    });

    const [sql, parametros] = query.mock.calls[0];
    expect(sql).toContain('SUM(a.cantidad_producida)');
    expect(sql).toContain('LEFT JOIN avances_produccion');
    expect(parametros).toEqual([15]);
  });

  it('devuelve cero y version cero cuando la orden aun no tiene avances', async () => {
    query.mockResolvedValue([{
      orden_id: '8',
      orden_codigo: 'ORD-0008',
      producto_id: '2',
      producto_codigo: 'GAL-001',
      producto_nombre: 'Galleta',
      unidad: 'kg',
      cantidad_conforme: '0',
      version: '0',
      fecha: null,
    }]);

    const respuesta = await service.consultarConformes(8);
    expect(respuesta).toMatchObject({
      cantidadConforme: '0.0000',
      version: 0,
      fecha: null,
    });
  });

  it('rechaza una orden inexistente sin inventar disponibilidad', async () => {
    query.mockResolvedValue([]);

    await expect(service.consultarConformes(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
