import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { HistorialService } from './historial.service';

const describeReal = process.env.HISTORIAL_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-334: cronología con migraciones y PostgreSQL', () => {
  const schema = `abc334_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let source: DataSource;
  let servicio: HistorialService;

  beforeAll(async () => {
    admin = new DataSource({ ...AppDataSource.options, migrations: [] });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      extra: { options: `-c search_path=${schema}` },
    });
    await source.initialize();
    await source.runMigrations({ transaction: 'all' });
    await source.query(`
      INSERT INTO recetas (producto_codigo, producto_nombre, unidad_producto)
        VALUES ('PAN-334', 'Pan de prueba', 'kg');
      INSERT INTO materiales (codigo, nombre, unidad_medida) VALUES ('HAR-334', 'Harina', 'kg');
      INSERT INTO ordenes_produccion
        (codigo, receta_id, cantidad_solicitada, fecha_programada, responsable_usuario_id)
        VALUES ('ORD-VISIBLE',1,20,'2026-11-10',7), ('ORD-AJENA',1,20,'2026-11-10',8),
               ('ORD-VACIA',1,20,'2026-11-10',7);
      INSERT INTO historial_estado_orden
        (orden_id, estado_anterior, estado_nuevo, usuario_responsable_id, usuario_responsable_nombre, fecha_hora)
        VALUES (1,NULL,'PENDIENTE',7,'Ana','2026-11-10T06:00:00-04:00'),
               (1,'PENDIENTE','PLANIFICADA',7,NULL,'2026-11-10T10:00:00Z'),
               (2,NULL,'PENDIENTE',8,'AJENA','2026-11-10T10:00:00Z');
      INSERT INTO avances_produccion
        (orden_id, cantidad_producida, usuario_responsable_id, usuario_responsable_nombre, fecha_hora)
        VALUES (1,10,7,'Ana','2026-11-10T10:00:00Z'),
               (1,2.125,7,'Ana','2026-11-10T10:01:00Z'),
               (2,99,8,'AJENA','2026-11-10T10:00:00Z');
      INSERT INTO resultados_conformes
        (orden_id, cantidad, tipo, causa_defecto, responsable_usuario_id, fecha_hora)
        VALUES (1,7,'CONFORME',NULL,7,'2026-11-10T10:00:00Z'),
               (1,5,'DEFECTUOSO','Sellado incompleto',7,'2026-11-10T10:00:00Z'),
               (2,5,'DEFECTUOSO','AJENA',8,'2026-11-10T10:00:00Z');
      INSERT INTO perdidas_materia_prima
        (orden_id, material_id, cantidad, unidad, motivo, autor_usuario_id, fecha_hora)
        VALUES (1,1,0.2500,'kg','Derrame',7,'2026-11-10T10:00:00Z'),
               (2,1,99,'kg','AJENA',8,'2026-11-10T10:00:00Z');
      INSERT INTO observaciones_orden (orden_id,tipo,descripcion,autor_usuario_id,autor_nombre,fecha_hora)
        VALUES (1,'OBSERVACION','Observación visible',7,'Ana','2026-11-10T10:00:00Z'),
               (1,'INCIDENCIA','Incidencia visible',7,'   ','2026-11-10T10:00:00Z'),
               (2,'INCIDENCIA','AJENA',8,'AJENA','2026-11-10T10:00:00Z');
      INSERT INTO lotes (orden_id,codigo,cantidad,responsable_usuario_id,fecha_hora)
        VALUES (1,'LOTE-VISIBLE',2.125,7,'2026-11-10T10:00:00Z'),
               (2,'LOTE-AJENA',99,8,'2026-11-10T10:00:00Z');
      INSERT INTO reprocesos
        (orden_id,resultado_calidad_id,cantidad_procesada,cantidad_recuperada,cantidad_descartada,autor_usuario_id,fecha_hora)
        VALUES (1,2,3,2,1,7,'2026-11-10T10:00:00Z'),
               (2,3,3,2,1,8,'2026-11-10T10:00:00Z');
    `);
    servicio = new HistorialService(source.getRepository(OrdenProduccion));
  }, 30000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('combina todas las fuentes sin multiplicar filas ni cruzar órdenes', async () => {
    const detalle = await servicio.detalleOrden(1);
    expect(detalle.orden).toEqual({ id: 1, codigo: 'ORD-VISIBLE', estado: 'PENDIENTE', unidadProducto: 'kg' });
    expect(detalle.eventos).toHaveLength(11);
    expect(new Set(detalle.eventos.map(({ clave }) => clave)).size).toBe(11);
    expect(JSON.stringify(detalle)).not.toContain('AJENA');
    expect(detalle.eventos.every(({ usuarioId }) => usuarioId === '7')).toBe(true);
  });

  it('ordena por instante, fuente e id con desempate estable', async () => {
    const esperado = ['ESTADO:1','ESTADO:2','AVANCE:1','CONFORME:1','DEFECTUOSO:2','PERDIDA:1',
      'OBSERVACION:1','INCIDENCIA:2','LOTE:1','REPROCESO:1','AVANCE:2'];
    for (let intento = 0; intento < 3; intento += 1) {
      expect((await servicio.detalleOrden(1)).eventos.map(({ clave }) => clave)).toEqual(esperado);
    }
  });

  it('conserva las cantidades decimales y la identidad histórica del autor', async () => {
    const { eventos } = await servicio.detalleOrden(1);
    expect(eventos.find(({ clave }) => clave === 'PERDIDA:1')).toMatchObject({
      usuarioNombre: 'Usuario #7',
      datos: { cantidad: '0.2500', unidad: 'kg', materialNombre: 'Harina', motivo: 'Derrame' },
    });
    expect(eventos.find(({ clave }) => clave === 'LOTE:1')).toMatchObject({
      datos: { codigo: 'LOTE-VISIBLE', cantidad: '2.1250', unidad: 'kg' },
    });
    expect(eventos.find(({ clave }) => clave === 'REPROCESO:1')).toMatchObject({
      datos: { cantidadProcesada: '3.0000', cantidadRecuperada: '2.0000', cantidadDescartada: '1.0000' },
    });
    expect(eventos.find(({ clave }) => clave === 'INCIDENCIA:2')?.usuarioNombre).toBe('Usuario #7');
  });

  it('devuelve una lista vacía para una orden antigua sin eventos', async () => {
    expect((await servicio.detalleOrden(3)).eventos).toEqual([]);
  });

  it('distingue una orden inexistente de un identificador inválido', async () => {
    await expect(servicio.detalleOrden(999)).rejects.toMatchObject({ status: 404 });
    await expect(servicio.detalleOrden(2147483648)).rejects.toMatchObject({ status: 404 });
    for (const id of [0, -1, 1.2, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(servicio.detalleOrden(id)).rejects.toMatchObject({ status: 400 });
    }
  });

  it('se ejecuta dentro de una transacción de solo lectura', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction('REPEATABLE READ');
    try {
      await runner.query('SET TRANSACTION READ ONLY');
      const lectura = new HistorialService(runner.manager.getRepository(OrdenProduccion));
      expect((await lectura.detalleOrden(1)).eventos).toHaveLength(11);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
