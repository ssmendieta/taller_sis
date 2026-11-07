import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { ReportesService } from './reportes.service';

const describeReal = process.env.REPORTES_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-336: reporte con PostgreSQL real aislado', () => {
  let source: DataSource;
  let runner: QueryRunner;
  let service: ReportesService;
  beforeAll(async () => {
    source = new DataSource({ ...AppDataSource.options, synchronize: false, migrationsRun: false });
    await source.initialize();
    runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    // Sin tablas ni secuencias persistentes: estas tablas solo existen en esta conexion.
    await runner.query(`CREATE TEMP TABLE recetas (id int PRIMARY KEY, producto_codigo text, producto_nombre text, unidad_producto text)`);
    await runner.query(`CREATE TEMP TABLE ordenes_produccion (id int PRIMARY KEY, codigo text,
      receta_id int, cantidad_solicitada numeric(10,2), fecha_programada date)`);
    await runner.query(`CREATE TEMP TABLE avances_produccion (orden_id bigint, cantidad_producida numeric(14,4), fecha_hora timestamptz)`);
    await runner.query(`CREATE TEMP TABLE resultados_conformes (orden_id bigint, tipo text, cantidad numeric(14,4))`);
    await runner.query(`CREATE TEMP TABLE consumos_material (orden_id bigint, material_id bigint, unidad text, cantidad numeric(14,4))`);
    await runner.query(`CREATE TEMP TABLE perdidas_materia_prima (orden_id bigint, material_id bigint, unidad text, cantidad numeric(14,4))`);
    await runner.query(`CREATE TEMP TABLE reprocesos (orden_id bigint, cantidad_procesada numeric(14,4),
      cantidad_recuperada numeric(14,4), cantidad_descartada numeric(14,4))`);
    await runner.query(`CREATE TEMP TABLE cierres_produccion (id bigint, orden_id bigint, cierre_version int,
      orden_codigo text, producto jsonb, consumos jsonb, cantidad_solicitada numeric(14,4),
      cantidad_producida numeric(14,4), cantidad_conforme numeric(14,4), cantidad_defectuosa numeric(14,4))`);
    await runner.query(`INSERT INTO recetas VALUES (1,'PAN','Pan','kg'),(2,'GAL','Galleta','kg'),
      (3,'PAN','Pan','g'),(4,'CAMBIO','Nombre actual','g'),(5,'P%_','Especial','unidad')`);
    await runner.query(`INSERT INTO ordenes_produccion VALUES
      (1,'O1',1,1.10,'2026-11-01'),(2,'O2',1,2.20,'2026-11-02'),
      (3,'O3',2,3,'2026-11-02'),(4,'O4',3,4,'2026-11-03'),
      (5,'O5',1,999,'2026-11-04'),(6,'O6',5,1,'2026-11-05')`);
    // Fechas de los eventos fuera del periodo: se selecciona la orden, no cada evento.
    await runner.query(`INSERT INTO avances_produccion VALUES
      (1,0.1,'2026-12-01'),(1,0.2,'2026-12-02'),(2,0.4,'2026-12-01'),(5,999,'2026-12-01')`);
    await runner.query(`INSERT INTO resultados_conformes VALUES
      (1,'CONFORME',0.04),(1,'CONFORME',0.06),(1,'DEFECTUOSO',0.1),(1,'DEFECTUOSO',0.1),
      (2,'CONFORME',0.4),(5,'CONFORME',999)`);
    await runner.query(`INSERT INTO consumos_material VALUES (1,1,'kg',0.1),(1,1,'kg',0.2),
      (1,1,'g',4),(1,2,'kg',5),(2,1,'kg',0.4),(2,3,'kg',9999999999.9999),
      (2,3,'kg',9999999999.9999),(4,3,'kg',0.0001),(5,1,'kg',999)`);
    await runner.query(`INSERT INTO perdidas_materia_prima VALUES (1,1,'kg',0.01),(1,1,'kg',0.02),
      (1,1,'g',0.1),(1,2,'kg',0.2),(5,1,'kg',0.5)`);
    await runner.query(`INSERT INTO reprocesos VALUES (1,0.1,0.06,0.04),(1,0.1,0.07,0.03),(5,1,0.8,0.2)`);
    await runner.query(`INSERT INTO cierres_produccion VALUES
      (11,5,1,'O5-v1','{"productoId":4,"codigo":"ANTIGUO","nombre":"Congelado","unidad":"kg"}',
        '[{"materialId":"1","unidad":"kg","cantidad":"7.0000"}]',10,8,7,1),
      (12,5,2,'O5-v2','{"productoId":4,"codigo":"ANTIGUO","nombre":"Congelado","unidad":"kg"}',
        '[{"materialId":"1","unidad":"kg","cantidad":"8.0000"}]',20,18,17,1)`);
    await runner.commitTransaction();
    await runner.startTransaction();
    await runner.query('SET TRANSACTION READ ONLY');
    service = new ReportesService({ query: runner.query.bind(runner) } as DataSource);
  }, 30000);
  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    await runner?.release();
    if (source?.isInitialized) await source.destroy();
  });

  it.each([
    [{ fechaDesde: '2026-11-04' }, [6,5]],
    [{ fechaHasta: '2026-11-01' }, [1]],
    [{ producto: 'pAn' }, [4,2,1]],
    [{ fechaDesde: '2026-11-02', fechaHasta: '2026-11-02', producto: 'pan' }, [2]],
    [{ fechaDesde: '2026-11-02', fechaHasta: '2026-11-02' }, [3,2]],
  ])('filtra %j y respeta limites inclusivos', async (query, ids) => {
    const reporte = await service.produccion(query);
    expect(reporte.ordenes.map((orden) => orden.ordenId)).toEqual(ids);
    expect(reporte.totales.ordenes).toBe(ids.length);
  });
  it('suma cada fuente por separado sin multiplicar cantidades ni reprocesos', async () => {
    const reporte = await service.produccion({ fechaHasta: '2026-11-01' });
    const orden = reporte.ordenes[0];
    expect(orden.cantidades).toEqual({ solicitada: '1.1000', producida: '0.3000', conforme: '0.1000',
      defectuosa: '0.2000', reprocesada: '0.2000', recuperada: '0.1300', descartada: '0.0700' });
    expect(orden.consumos).toEqual([
      { materialId: '1', unidad: 'g', cantidad: '4.0000' },
      { materialId: '1', unidad: 'kg', cantidad: '0.3000' },
      { materialId: '2', unidad: 'kg', cantidad: '5.0000' },
    ]);
    expect(orden.perdidas).toContainEqual({ materialId: '1', unidad: 'kg', cantidad: '0.0300' });
    expect(reporte.totales.productos[0].cantidades).toEqual(orden.cantidades);
  });
  it('agrupa por producto, receta y unidad y mantiene precision mas alla de number', async () => {
    const reporte = await service.produccion({ fechaHasta: '2026-11-03' });
    expect(reporte.totales.productos).toHaveLength(3);
    const pan = reporte.totales.productos.find((grupo) => grupo.producto.recetaId === 1);
    expect(pan.cantidades).toMatchObject({ solicitada: '3.3000', producida: '0.7000', conforme: '0.5000' });
    expect(reporte.totales.consumos).toContainEqual({ materialId: '3', unidad: 'kg', cantidad: '19999999999.9999' });
    expect(reporte.totales.consumos).toContainEqual({ materialId: '1', unidad: 'kg', cantidad: '0.7000' });
    expect(reporte.totales.consumos).toContainEqual({ materialId: '1', unidad: 'g', cantidad: '4.0000' });
    expect(reporte.totales.perdidas).toHaveLength(3);
  });
  it('usa solo el mayor cierre, sin sumar fuentes actuales ni versiones anteriores', async () => {
    const reporte = await service.produccion({ producto: 'antiguo' });
    expect(reporte.ordenes).toHaveLength(1);
    expect(reporte.ordenes[0]).toMatchObject({ codigo: 'O5-v2', fuente: 'CIERRE', cierre: { id: '12', version: 2 },
      producto: { recetaId: 4, codigo: 'ANTIGUO', nombre: 'Congelado', unidad: 'kg' },
      cantidades: { solicitada: '20.0000', producida: '18.0000', conforme: '17.0000', defectuosa: '1.0000',
        recuperada: '0.8000', descartada: '0.2000' },
      consumos: [{ materialId: '1', unidad: 'kg', cantidad: '8.0000' }],
      perdidas: [{ materialId: '1', unidad: 'kg', cantidad: '0.5000' }],
    });
    expect((await service.produccion({ producto: 'CAMBIO' })).ordenes).toEqual([]);
  });
  it('devuelve ceros y arreglos vacios para ordenes sin registros', async () => {
    const orden = (await service.produccion({ producto: 'GAL' })).ordenes[0];
    expect(orden).toMatchObject({ fuente: 'REGISTROS', cierre: null, consumos: [], perdidas: [],
      cantidades: { producida: '0.0000', conforme: '0.0000', defectuosa: '0.0000', recuperada: '0.0000' } });
  });
  it('escapa comodines y parametriza el producto', async () => {
    expect((await service.produccion({ producto: '%_' })).ordenes.map((orden) => orden.ordenId)).toEqual([6]);
    expect((await service.produccion({ producto: "' OR 1=1 --" })).totales.ordenes).toBe(0);
  });
  it('devuelve contrato vacio completo y filtros efectivos', async () => {
    expect(await service.produccion({ producto: 'inexistente' })).toEqual({
      filtros: { fechaDesde: null, fechaHasta: null, producto: 'inexistente', campoFecha: 'fecha_programada' },
      ordenes: [], totales: { ordenes: 0, productos: [], consumos: [], perdidas: [] },
    });
  });
});
