import { AppDataSource } from '../database/data-source';

async function main() {
  const database = String(AppDataSource.options.database);
  if (!/^produccion_contabilidad_demo(?:_|$)/.test(database)) {
    throw new Error('El seed contable solo puede ejecutarse en una base produccion_contabilidad_demo*');
  }
  await AppDataSource.initialize();
  try {
    const [receta] = await AppDataSource.query(`
      INSERT INTO recetas (producto_codigo, producto_nombre, unidad_producto)
      VALUES ('ABC253-DEMO', 'Producto demo contable', 'unidad')
      ON CONFLICT (producto_codigo) WHERE activa = TRUE
      DO UPDATE SET producto_nombre = EXCLUDED.producto_nombre
      RETURNING id::text AS id
    `);
    const [material] = await AppDataSource.query(`
      INSERT INTO materiales (codigo, nombre, unidad_medida)
      VALUES ('ABC253-MAT', 'Material demo contable', 'kg')
      ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id::text AS id
    `);
    const orderIds: Record<string, string> = {};
    for (const [kind, code] of [
      ['valido', 'ORD-ABC253-VALIDO'],
      ['rechazado', 'ORD-ABC253-RECHAZADO'],
      ['interrupcion', 'ORD-ABC253-INTERRUPCION'],
    ] as const) {
      const [order] = await AppDataSource.query(`
        INSERT INTO ordenes_produccion
          (codigo, receta_id, cantidad_solicitada, fecha_programada,
           responsable_usuario_id, responsable_nombre, estado, finalizada_en)
        VALUES ($1, $2, 10, CURRENT_DATE, 1, 'Demo ABC-253', 'FINALIZADA', NOW())
        ON CONFLICT (codigo) DO UPDATE SET estado = 'FINALIZADA', finalizada_en = NOW()
        RETURNING id::text AS id
      `, [code, receta.id]);
      orderIds[kind] = order.id;
      const [{ total }] = await AppDataSource.query(
        'SELECT COUNT(*)::int AS total FROM avances_produccion WHERE orden_id = $1',
        [order.id],
      );
      if (total === 0) {
        await AppDataSource.query(`INSERT INTO avances_produccion
          (orden_id, cantidad_producida, usuario_responsable_id, usuario_responsable_nombre)
          VALUES ($1, 10, 1, 'Demo ABC-253')`, [order.id]);
        await AppDataSource.query(`INSERT INTO resultados_conformes
          (orden_id, cantidad, responsable_usuario_id, tipo, causa_defecto)
          VALUES ($1, 10, 1, $2, $3)`, [
          order.id,
          kind === 'rechazado' ? 'DEFECTUOSO' : 'CONFORME',
          kind === 'rechazado' ? 'Caso contable rechazado' : null,
        ]);
        await AppDataSource.query(`INSERT INTO consumos_material
          (orden_id, material_id, cantidad, unidad, usuario_registro_id)
          VALUES ($1, $2, 2, 'kg', 1)`, [order.id, material.id]);
      }
    }
    console.log(JSON.stringify({
      database,
      ordenValidaId: orderIds.valido,
      ordenRechazadaId: orderIds.rechazado,
      ordenInterrupcionId: orderIds.interrupcion,
    }));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
