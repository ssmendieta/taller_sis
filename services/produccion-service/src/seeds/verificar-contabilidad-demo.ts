import { AppDataSource } from '../database/data-source';

async function main() {
  const database = String(AppDataSource.options.database);
  if (!/^produccion_contabilidad_demo(?:_|$)/.test(database)) {
    throw new Error('La verificacion solo puede ejecutarse en una base demo contable');
  }
  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.query(`
      SELECT c.id::text, c.orden_id::text, c.estado_contable,
             c.resultado_contable_event_id::text AS response_event_id,
             o.event_id::text AS request_event_id,
             o.correlation_id::text,
             o.estado AS outbox_estado,
             i.estado AS inbox_estado
      FROM cierres_produccion c
      JOIN eventos_outbox o ON o.aggregate_id = c.id::text
        AND o.event_type = 'ProduccionCerrada.v1'
      LEFT JOIN eventos_inbox i ON i.event_id = c.resultado_contable_event_id
      ORDER BY c.id
    `);
    const [counts] = await AppDataSource.query(`
      SELECT COUNT(*)::int AS inbox_total,
             COUNT(DISTINCT event_id)::int AS inbox_event_ids
      FROM eventos_inbox WHERE event_type = 'RegistroContableResultado.v1'
    `);
    console.log(JSON.stringify({ database, cierres: rows, ...counts }));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
