import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { repararProductoHistorico } from '../boletas/reparar-producto-historico';

// Solo mantenimiento LOCAL, con IDs explícitos. Por defecto no modifica datos.
export async function ejecutarReparacion(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--ids='))
    || args.filter((arg) => arg.startsWith('--ids=')).length !== 1) {
    throw new Error('Uso: npm run boletas:reparar-producto -- --ids=1,2 [--apply]');
  }
  const local = (host: string) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
  const dbHost = (AppDataSource.options as { host?: string }).host;
  const auth = new URL(process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3001');
  const produccion = new URL(process.env.PRODUCCION_SERVICE_URL || 'http://127.0.0.1:3002');
  if (!local(dbHost) || !local(auth.hostname) || !local(produccion.hostname)) {
    throw new Error('Este procedimiento está limitado a base y servicios locales.');
  }
  const token = process.env.BOLETAS_REPARACION_TOKEN?.trim();
  if (!token) throw new Error('Falta BOLETAS_REPARACION_TOKEN; usa una sesión vigente, nunca un token en argumentos.');
  const authorization = `Bearer ${token}`;
  const res = await fetch(new URL('me', auth.href.replace(/\/?$/, '/')), {
    headers: { Authorization: authorization }, signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  if (!res.ok) throw new Error('Auth rechazó la sesión de mantenimiento.');
  const actor = await res.json() as { id: string; permisos: { codigo: string }[] };
  if (!actor.permisos?.some((p) => p.codigo === 'logistica.boletas.gestionar')) {
    throw new Error('La sesión no tiene permiso logistica.boletas.gestionar.');
  }
  // Una sola base: Logística. Producción se consulta mediante HTTP autenticado.
  const source = new DataSource({ ...AppDataSource.options, entities: [], migrations: [], synchronize: false });
  await source.initialize();
  try {
    return await repararProductoHistorico(source, new LotesProduccionClient(),
      args.find((arg) => arg.startsWith('--ids=')).slice(6).split(','), String(actor.id), authorization, args.includes('--apply'));
  } finally { await source.destroy(); }
}

if (require.main === module) ejecutarReparacion()
  .then((resultado) => console.log(JSON.stringify(resultado, null, 2)))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
