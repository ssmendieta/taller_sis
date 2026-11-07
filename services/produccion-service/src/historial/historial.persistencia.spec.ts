import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { EstadoOrden } from '../ordenes/estado-orden.enum';
import { HistorialService } from './historial.service';
import { ListarHistorialOrdenesDto } from './dto/listar-historial-ordenes.dto';

const describeReal = process.env.HISTORIAL_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-332: consulta PostgreSQL real (tablas temporales, rollback)', () => {
  let source: DataSource;
  let runner: QueryRunner;
  let service: HistorialService;
  beforeAll(async () => {
    source = new DataSource({ ...AppDataSource.options, synchronize: false, migrationsRun: false });
    await source.initialize();
    runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    // Tablas de la conexion de prueba: no alteran tablas, secuencias ni filas reales.
    await runner.query(`CREATE TEMP TABLE recetas (
      id integer PRIMARY KEY, producto_codigo text, producto_nombre text, unidad_producto text)`);
    await runner.query(`CREATE TEMP TABLE ordenes_produccion (
      id integer PRIMARY KEY, codigo text, receta_id integer, cantidad_solicitada numeric(10,2),
      fecha_programada date, estado text, responsable_usuario_id integer, responsable_nombre text)`);
    await runner.query(`CREATE TEMP TABLE receta_material (receta_id integer, material_id integer)`);
    await runner.query(`INSERT INTO recetas VALUES (1,'PAN-01','Pan integral','kg'),(2,'GAL-01','Galleta','unidad'),(3,'PAN-01','Pan antiguo','kg'),(4,'P%_','Especial','kg')`);
    await runner.query(`INSERT INTO receta_material VALUES (1,1),(1,2),(1,3),(3,1),(3,2)`);
    await runner.query(`INSERT INTO ordenes_produccion VALUES
      (1,'O-1',1,10,'2026-11-01','FINALIZADA',7,'Ana'),
      (2,'O-2',1,20,'2026-11-02','FINALIZADA',7,NULL),
      (3,'O-3',2,30,'2026-11-02','CANCELADA',7,'Ana'),
      (4,'O-4',3,40,'2026-11-02','FINALIZADA',7,'Ana'),
      (5,'O-5',4,50,'2026-11-03','PENDIENTE',7,'Ana')`);
    service = new HistorialService(runner.manager.getRepository(OrdenProduccion));
  }, 30000);
  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    await runner?.release();
    if (source?.isInitialized) await source.destroy();
  });

  const listar = (query: Partial<ListarHistorialOrdenesDto> = {}) => service.listarOrdenes({ page: 1, limit: 10, ...query });
  it.each([
    [{ fechaDesde: '2026-11-02' }, [5,4,3,2]],
    [{ fechaHasta: '2026-11-01' }, [1]],
    [{ estado: EstadoOrden.FINALIZADA }, [4,2,1]],
    [{ producto: 'pAn' }, [4,2,1]],
    [{ producto: 'GAL-01' }, [3]],
    [{ fechaDesde: '2026-11-02', fechaHasta: '2026-11-02', estado: EstadoOrden.FINALIZADA, producto: 'pan' }, [4,2]],
  ] as Array<[Partial<ListarHistorialOrdenesDto>, number[]]>)('aplica filtros %j con extremos inclusivos', async (query, ids) => {
    const result = await listar(query);
    expect(result.items.map((item) => item.id)).toEqual(ids);
    expect(result.total).toBe(ids.length);
  });
  it('pagina en BD, desempata por id y cuenta ordenes sin multiplicar por materiales/versiones', async () => {
    const paginas = [];
    for (const page of [1,2,3]) paginas.push(await listar({ page, limit: 2 }));
    expect(paginas.flatMap((pagina) => pagina.items.map((item) => item.id))).toEqual([5,4,3,2,1]);
    for (const pagina of paginas) expect(pagina).toMatchObject({ total: 5, limit: 2, totalPages: 3 });
    expect((await listar({ producto: 'PAN-01', limit: 1 })).total).toBe(3);
    expect((await listar({ page: 2, limit: 2 })).items).toEqual(paginas[1].items);
  });
  it('conserva tipos y campos del contrato', async () => {
    expect((await listar({ producto: 'PAN-01', page: 2, limit: 1 })).items[0]).toEqual({
      id: 2, codigo: 'O-2', producto_id: 1, producto_codigo: 'PAN-01', producto_nombre: 'Pan integral',
      unidad_producto: 'kg', cantidad_solicitada: '20.00', fecha_programada: '2026-11-02',
      estado: 'FINALIZADA', responsable_usuario_id: 7, responsable_nombre: 'Usuario #7',
    });
  });
  it('trata comodines como texto y parametriza el producto', async () => {
    expect((await listar({ producto: '%_' })).items.map((item) => item.id)).toEqual([5]);
    expect((await listar({ producto: "' OR 1=1 --" })).total).toBe(0);
  });
  it('devuelve vacio sin coincidencias o al superar la ultima pagina', async () => {
    expect(await listar({ producto: 'Inexistente' })).toEqual({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    expect(await listar({ page: 9 })).toEqual({ items: [], total: 5, page: 9, limit: 10, totalPages: 1 });
  });
});
