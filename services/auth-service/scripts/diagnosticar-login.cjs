const path = require('node:path');
const { Client } = require('pg');
const { compare, hash } = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  const correo = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!correo || !password || !process.env.ADMIN_NOMBRE) {
    console.log('Faltan ADMIN_EMAIL, ADMIN_PASSWORD o ADMIN_NOMBRE en la configuracion.');
    return;
  }
  const config = {
    host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
    user: process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || process.env.DB_AUTH_DATABASE || process.env.POSTGRES_DB || 'auth_db',
  };
  console.log(`Conexion usada: ${config.host}:${config.port}/${config.database} (${config.user}).`);
  const client = new Client(config);
  await client.connect();
  let coinciden = false;
  try {
    const resultado = await client.query(`
      SELECT u.id, u.correo, u.activo, u.eliminado_en, u.password_hash, r.nombre AS rol
      FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE LOWER(u.correo) = $1
    `, [correo]);
    if (resultado.rowCount !== 1) {
      console.log(`No existe el usuario ${correo} en esta base. Ejecute npm run seed:admin.`);
      return;
    }
    const u = resultado.rows[0];
    console.log(`Usuario: ${u.correo}; rol: ${u.rol}; activo: ${u.activo}; baja logica: ${u.eliminado_en ? 'si' : 'no'}.`);
    coinciden = await compare(password, u.password_hash);
    console.log(`ADMIN_PASSWORD coincide con el hash guardado: ${coinciden ? 'SI' : 'NO'}.`);
    if (!coinciden && process.argv.includes('--reset')) {
      if (u.rol !== 'Administrador' || !u.activo || u.eliminado_en) {
        console.log('No se cambio la contrasena: la cuenta debe ser un Administrador activo.');
        return;
      }
      if (password.length < 8) {
        console.log('No se cambio la contrasena: ADMIN_PASSWORD debe tener al menos 8 caracteres.');
        return;
      }
      await client.query('UPDATE usuarios SET password_hash = $1, actualizado_en = NOW() WHERE id = $2',
        [await hash(password, 10), u.id]);
      coinciden = true;
      console.log('Contrasena del Administrador actualizada con ADMIN_PASSWORD.');
    }
  } finally {
    await client.end();
  }
  if (!coinciden) {
    console.log('Si desea actualizarla, ejecute: node scripts\\diagnosticar-login.cjs --reset');
    return;
  }
  for (const [nombre, url] of [
    ['Auth directo', 'http://localhost:3001/login'],
    ['Gateway', 'http://localhost:3000/api/auth/login'],
  ]) {
    try {
      const respuesta = await fetch(url, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, password }), signal: AbortSignal.timeout(4000) });
      if (respuesta.ok) {
        console.log(`${nombre}: HTTP ${respuesta.status}, login correcto.`);
      } else {
        const datos = await respuesta.json().catch(() => ({}));
        console.log(`${nombre}: HTTP ${respuesta.status}, ${JSON.stringify(datos.message || datos.error || 'error')}.`);
      }
    } catch (error) {
      console.log(`${nombre}: sin conexion (${error.name || 'error'}).`);
    }
  }
}

main().catch((error) => {
  console.error(`Diagnostico detenido: ${error.code || error.message}`);
  process.exitCode = 1;
});
