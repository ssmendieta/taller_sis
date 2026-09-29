import { Repository } from 'typeorm';
import { OrdenesService } from './ordenes.service';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';

describe('ABC-169: consulta de órdenes', () => {
  const registrosAlmacenados = [{
    id: '18', codigo: 'ORD-18', producto_codigo: 'P-01', producto_nombre: 'Pan',
    cantidad_solicitada: '2.5000', fecha_programada: '2026-10-04',
    estado: 'PLANIFICADA', responsable_usuario_id: '7',
  }];
  const query = jest.fn().mockResolvedValue(registrosAlmacenados);
  const servicio = new OrdenesService(
    { query } as unknown as Repository<OrdenProduccion>,
    {} as Repository<HistorialEstadoOrden>,
    {} as any,
    {} as any,
  );

  beforeEach(() => query.mockClear());

  it('expone los campos que usa la tabla y toma producto de la receta almacenada', async () => {
    const respuesta = await servicio.buscar();
    expect(respuesta).toEqual(registrosAlmacenados);
    expect(respuesta[0]).toMatchObject({
      codigo: 'ORD-18', producto_nombre: 'Pan', cantidad_solicitada: '2.5000',
      fecha_programada: '2026-10-04', estado: 'PLANIFICADA',
    });
    expect(query.mock.calls[0][0]).toContain('JOIN recetas r ON r.id = o.receta_id');
  });

  it('usa parámetros para filtros, sin incorporar texto de búsqueda al SQL', async () => {
    const texto = "Pan' OR true --";
    await servicio.buscar('PLANIFICADA', texto, '2026-10-04');
    const [sql, parametros] = query.mock.calls[0];
    expect(sql).not.toContain(texto);
    expect(parametros).toEqual(['PLANIFICADA', texto, '2026-10-04']);
  });
});
