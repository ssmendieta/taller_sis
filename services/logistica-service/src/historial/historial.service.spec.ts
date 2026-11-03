import { BadRequestException } from '@nestjs/common';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { ValidarListarHistorialRutasPipe } from './dto/validar-listar-historial-rutas.pipe';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';

describe('ABC-391: validación de filtros del historial de rutas', () => {
  const pipe = new ValidarListarHistorialRutasPipe();

  it('usa página 1 y 10 registros por defecto', () => {
    expect(pipe.transform({})).toEqual({ page: 1, limit: 10 });
    expect(pipe.transform(undefined)).toEqual({ page: 1, limit: 10 });
  });

  it('acepta filtros combinados y normaliza estado y chofer', () => {
    expect(pipe.transform({
      page: '2', limit: '5', fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estado: 'planificada', chofer: ' CHO-07 ',
    })).toEqual({
      page: 2, limit: 5, fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estado: 'PLANIFICADA', chofer: 'CHO-07',
    });
  });

  it('ignora filtros vacíos', () => {
    expect(pipe.transform({ estado: '', chofer: '', fechaDesde: '' })).toEqual({ page: 1, limit: 10 });
  });

  it.each([
    [{ fechaDesde: '2026-02-30' }],
    [{ fechaDesde: '2026-11-10', fechaHasta: '2026-11-01' }],
    [{ estado: 'PERDIDA' }],
    [{ page: '0' }],
    [{ limit: '101' }],
    [{ chofer: 'x'.repeat(81) }],
    [{ orden: '5' }],
  ])('rechaza %j', (query) => {
    expect(() => pipe.transform(query)).toThrow(BadRequestException);
  });
});

describe('ABC-391: HistorialService', () => {
  let query: jest.Mock;
  let service: HistorialService;

  beforeEach(() => {
    query = jest.fn(async (sql: string) => sql.includes('COUNT(*)::int AS total')
      ? [{ total: 23 }]
      : [{
        id: '7', fecha_programada: '2026-11-10', estado: 'PLANIFICADA',
        vehiculo_externo_id: 'VEH-01', chofer_externo_id: 'CHO-07', total_paradas: 2, total_boletas: 3,
      }]);
    service = new HistorialService({ query } as any);
  });

  it('combina todos los filtros con AND usando parámetros', async () => {
    await service.listarRutas({
      page: 1, limit: 10, fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estado: 'DESPACHADA' as any, chofer: 'CHO',
    });
    const [sqlTotal, paramsTotal] = query.mock.calls[0];
    expect(sqlTotal).toContain('ruta.fecha_programada >= $1::date AND ruta.fecha_programada <= $2::date AND ruta.estado = $3 AND ruta.chofer_externo_id ILIKE');
    expect(paramsTotal).toEqual(['2026-11-01', '2026-11-30', 'DESPACHADA', 'CHO']);
  });

  it('pagina con orden estable por fecha e id y calcula páginas', async () => {
    const result = await service.listarRutas({ page: 3, limit: 10 });
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('ORDER BY ruta.fecha_programada DESC, ruta.id DESC');
    expect(params).toEqual([10, 20]);
    expect(result).toMatchObject({ total: 23, page: 3, limit: 10, totalPages: 3 });
    expect(result.items[0]).toEqual({
      id: '7', fechaProgramada: '2026-11-10', estado: 'PLANIFICADA',
      vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-07', totalParadas: 2, totalBoletas: 3,
    });
  });

  it('cuenta paradas y boletas en subconsultas, sin JOIN que duplique rutas', async () => {
    await service.listarRutas({ page: 1, limit: 10 });
    const sql = query.mock.calls[1][0] as string;
    expect(sql).toMatch(/FROM rutas ruta\s+ORDER BY/);
  });

  it('escapa comodines en el filtro de chofer', async () => {
    await service.listarRutas({ page: 1, limit: 10, chofer: '50%_x' });
    expect(query.mock.calls[0][1]).toEqual(['50\\%\\_x']);
  });

  it('sin resultados devuelve lista vacía y cero páginas', async () => {
    query.mockImplementation(async (sql: string) => sql.includes('AS total') && !sql.includes('total_paradas') ? [{ total: 0 }] : []);
    await expect(service.listarRutas({ page: 1, limit: 10 })).resolves.toEqual({
      items: [], total: 0, page: 1, limit: 10, totalPages: 0,
    });
  });

  it('el controlador exige permiso de consulta de rutas', () => {
    expect(Reflect.getMetadata('__guards__', HistorialController)).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, HistorialController.prototype.listarRutas)).toBe('logistica.rutas.consultar');
  });
});
