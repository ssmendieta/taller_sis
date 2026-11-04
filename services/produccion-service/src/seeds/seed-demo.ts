import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const MATERIALES = [
  { codigo: 'HAR-001', nombre: 'Harina de trigo', unidad: 'kg', stock: 100 },
  { codigo: 'AZU-001', nombre: 'Azúcar', unidad: 'kg', stock: 5 },
  { codigo: 'MAN-001', nombre: 'Manteca', unidad: 'kg', stock: 50 },
];

async function main() {
  const client = new Client({
    host: process.env.DB_HOST ?? process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'postgres',
    database:
      process.env.DB_DATABASE ??
      process.env.DB_PRODUCCION_DATABASE ??
      'produccion_db',
  });
  await client.connect();
  try {
    for (const m of MATERIALES) {
      await client.query(
        `INSERT INTO materiales (codigo, nombre, unidad_medida, activo)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, unidad_medida = EXCLUDED.unidad_medida`,
        [m.codigo, m.nombre, m.unidad],
      );
      await client.query(
        `INSERT INTO inventario_material (material_id, cantidad_disponible, actualizado_en)
         SELECT id, $2, NOW() FROM materiales WHERE codigo = $1
         ON CONFLICT DO NOTHING`,
        [m.codigo, m.stock],
      );
      await client.query(
        `UPDATE inventario_material SET cantidad_disponible = $2, actualizado_en = NOW()
         WHERE material_id = (SELECT id FROM materiales WHERE codigo = $1)
           AND cantidad_disponible IS DISTINCT FROM $2`,
        [m.codigo, m.stock],
      );
    }
    await client.query(
      `INSERT INTO recetas (producto_codigo, producto_nombre, activa)
       SELECT 'PAN-001', 'Pan común', TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM recetas WHERE producto_codigo = 'PAN-001' AND activa = TRUE
       )`,
    );
    await client.query(
      `INSERT INTO receta_material (receta_id, material_id, cantidad_requerida)
       SELECT r.id, m.id, v.cantidad FROM recetas r
       JOIN (VALUES ('HAR-001', 2), ('AZU-001', 10), ('MAN-001', 1)) AS v(codigo, cantidad)
         ON TRUE
       JOIN materiales m ON m.codigo = v.codigo
       WHERE r.producto_codigo = 'PAN-001' AND r.activa = TRUE
       ON CONFLICT DO NOTHING`,
    );
    console.log('seed:demo: materiales, inventario y receta PAN-001 listos (AZU-001 insuficiente).');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`seed:demo: ${(error as Error).message}`);
  process.exit(1);
});
