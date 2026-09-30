import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import { hash } from 'bcryptjs';
import { leerDatosAdmin } from './seed-admin.helpers';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

async function main() {
  const datos = leerDatosAdmin();
  if (!datos) {
    console.warn(
      'seed:admin: faltan ADMIN_EMAIL, ADMIN_PASSWORD (min 8) o ADMIN_NOMBRE. No se creó nada.',
    );
    return;
  }
  const client = new Client({
    host: process.env.DB_HOST ?? process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'postgres',
    database:
      process.env.DB_DATABASE ??
      process.env.DB_AUTH_DATABASE ??
      process.env.POSTGRES_DB ??
      'auth_db',
  });
  await client.connect();
  try {
    const rol = await client.query(
      `SELECT id FROM roles WHERE nombre = 'Administrador' LIMIT 1`,
    );
    if (rol.rowCount === 0) {
      console.warn('seed:admin: no existe el rol Administrador. Ejecute migraciones primero.');
      return;
    }
    const rolId = rol.rows[0].id;
    const existente = await client.query(
      `SELECT id FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1`,
      [datos.correo],
    );
    if ((existente.rowCount ?? 0) > 0) {
      console.log(`seed:admin: ya existe ${datos.correo}, no se duplica.`);
      return;
    }
    const passwordHash = await hash(datos.password, 10);
    const creado = await client.query(
      `INSERT INTO usuarios (nombre_completo, correo, password_hash, rol_id, activo)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
      [datos.nombre, datos.correo, passwordHash, rolId],
    );
    const usuarioId = creado.rows[0].id;
    await client.query(
      `INSERT INTO auditoria (usuario_actor_id, accion, entidad, entidad_id, usuario_afectado_id, datos_antes, datos_despues)
       VALUES (NULL, 'CREACION_USUARIO', 'USUARIO', $1, $1, NULL, $2)`,
      [
        String(usuarioId),
        JSON.stringify({
          id: String(usuarioId),
          nombre_completo: datos.nombre,
          correo: datos.correo,
          rol_id: String(rolId),
          activo: true,
          origen: 'seed:admin',
        }),
      ],
    );
    console.log(`seed:admin: administrador ${datos.correo} creado.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`seed:admin: ${(error as Error).message}`);
  process.exit(1);
});
