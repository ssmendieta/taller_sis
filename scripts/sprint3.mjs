import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ABC-403: comprobaciones de lectura. Nunca cambia datos, permisos, credenciales
// ni recursos de Google. El arranque local se solicita con iniciar-local.
const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const COMPOSE_LOCAL = ['-f', 'docker-compose.yml', '-f', 'docker-compose.sprint3-local.yml', '--profile', 'full'];
const SERVICIOS = ['postgres', 'frontend', 'api-gateway', 'auth-service', 'produccion-service', 'logistica-service'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ejecutar = (cmd, args) => spawnSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', shell: false, maxBuffer: 16 * 1024 * 1024 });

export function parsearContenedores(texto) {
  const limpio = texto.trim();
  if (!limpio) return [];
  const datos = limpio.startsWith('[') ? JSON.parse(limpio) : limpio.split(/\r?\n/).filter(Boolean).map((linea) => JSON.parse(linea));
  if (!Array.isArray(datos)) throw new Error('La salida de Docker no es un listado.');
  return datos;
}

export function iniciarLocal(run = ejecutar) {
  const pasos = [['compose', ...COMPOSE_LOCAL, 'config', '--quiet']];
  // Un servicio por comando evita varias instalaciones npm simultáneas.
  for (const servicio of ['produccion-service', 'logistica-service', 'auth-service', 'api-gateway', 'frontend']) {
    pasos.push(['compose', ...COMPOSE_LOCAL, '--progress', 'plain', 'build', servicio]);
  }
  pasos.push(['compose', ...COMPOSE_LOCAL, 'up', '-d', '--no-build']);
  pasos.push(['compose', ...COMPOSE_LOCAL, 'ps']);
  for (const args of pasos) {
    const resultado = run('docker', args);
    if (resultado.stdout) process.stdout.write(resultado.stdout);
    if (resultado.stderr) process.stderr.write(resultado.stderr);
    if (resultado.error || resultado.status !== 0) {
      throw new Error(`Falló Docker en ${args.includes('build') ? `build ${args.at(-1)}` : args.at(-1)}. El arranque se detuvo.`);
    }
  }
}

export async function probarHumo({ token, gateway = 'http://localhost:3000', frontend = 'http://localhost:5173',
  fechaDesde, fechaHasta, local = true, eventId, responseEventId, run = ejecutar, fetchImpl = fetch } = {}) {
  if (!token?.trim()) throw new Error('Falta SPRINT3_TOKEN: usa una sesión con permisos de Producción y Logística.');
  if (eventId && !UUID.test(eventId)) throw new Error('SPRINT3_EVENT_ID debe ser un UUID válido.');
  if (responseEventId && !UUID.test(responseEventId)) throw new Error('SPRINT3_RESPONSE_EVENT_ID debe ser un UUID válido.');
  const hoy = new Date().toISOString().slice(0, 10);
  const hasta = fechaHasta || hoy;
  const desde = fechaDesde || hasta.slice(0, 8) + '01';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    throw new Error('El rango debe tener fechas AAAA-MM-DD ordenadas.');
  }
  const compose = local ? COMPOSE_LOCAL : ['--profile', 'full'];
  const reporte = { tarea: 'ABC-403', fecha: new Date().toISOString(), modo: local ? 'LOCAL_SIN_GCP' : 'CONFIGURACION_BASE',
    revision: null, comprobaciones: [], integracion: { publicada: false, respuestaPersistida: false,
      capturaGoogle: 'POR_ADJUNTAR', capturaDocker: 'POR_ADJUNTAR' } };
  const agregar = (nombre, ok, detalle = '') => reporte.comprobaciones.push({ nombre, ok: Boolean(ok), detalle });
  const docker = (...args) => {
    const r = run('docker', ['compose', ...compose, ...args]);
    if (r.error || r.status !== 0) throw new Error('El comando Docker no terminó correctamente.');
    return r.stdout.trim();
  };
  async function json(nombre, ruta, validar, autenticado = true) {
    try {
      const res = await fetchImpl(new URL(ruta, gateway), { headers: autenticado ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15000), redirect: 'error' });
      const body = await res.json();
      const ok = res.status === 200 && validar(body);
      agregar(nombre, ok, `HTTP ${res.status}`);
      return ok ? body : null;
    } catch { agregar(nombre, false, 'Sin respuesta JSON válida en el plazo previsto.'); return null; }
  }
  try {
    const git = run('git', ['rev-parse', 'HEAD']);
    if (git.status === 0 && /^[0-9a-f]{40}$/.test(git.stdout.trim())) reporte.revision = git.stdout.trim();
    const contenedores = parsearContenedores(docker('ps', '--format', 'json'));
    for (const servicio of SERVICIOS) {
      const fila = contenedores.find((c) => c.Service === servicio);
      agregar(`Docker: ${servicio}`, fila?.State?.toLowerCase() === 'running'
        && (servicio !== 'postgres' || fila.Health === 'healthy'));
    }
  } catch { agregar('Docker: inspección de contenedores', false, 'No se pudo comprobar el estado.'); }
  try {
    const res = await fetchImpl(frontend, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    const html = await res.text();
    agregar('Frontend: documento HTML', res.status === 200 && /<div[^>]+id=["']root["']/.test(html), `HTTP ${res.status}`);
  } catch { agregar('Frontend: documento HTML', false, 'No se pudo abrir el frontend.'); }
  for (const [nombre, ruta] of [['Gateway', '/health'], ['Auth', '/api/auth/health'],
    ['Producción', '/api/produccion/health'], ['Logística', '/api/logistica/health']]) {
    await json(`Health: ${nombre}`, ruta, (b) => b?.status === 'ok', false);
  }
  await json('Producción: conexión PostgreSQL', '/api/produccion/health/database', (b) => b?.database === 'connected' && b.status === 'ok', false);
  await json('Auth: sesión vigente', '/api/auth/me', (b) => Boolean(b?.id) && Array.isArray(b.permisos));
  await json('ABC-108: historial de producción', '/api/produccion/historial/ordenes?limit=1',
    (b) => Array.isArray(b?.items) && Number.isSafeInteger(b.total) && b.total >= 0);
  const rango = new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta });
  await json('ABC-109: reporte de producción', `/api/produccion/reportes/produccion?${rango}`,
    (b) => Boolean(b?.filtros) && Array.isArray(b.ordenes) && Boolean(b.totales));
  await json('ABC-110: reporte logístico', `/api/logistica/reportes/logistica?${rango}`,
    (b) => Boolean(b?.filtros) && Array.isArray(b.rutas) && Array.isArray(b.boletas) && Boolean(b.resumen));

  function consultarBase(servicio, sql) {
    const usuario = docker('exec', '-T', 'postgres', 'printenv', 'POSTGRES_USER');
    const base = docker('exec', '-T', servicio, 'printenv', 'DB_DATABASE');
    if (!usuario || !base) throw new Error('Falta configuración de la base.');
    return JSON.parse(docker('exec', '-T', 'postgres', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
      '-U', usuario, '-d', base, '-c', `BEGIN READ ONLY; ${sql}; COMMIT;`));
  }
  for (const [servicio, tabla] of [['auth-service', 'usuarios'], ['produccion-service', 'ordenes_produccion'], ['logistica-service', 'rutas']]) {
    try {
      const datos = consultarBase(servicio, `SELECT json_build_object('filas',count(*)) FROM ${tabla}`);
      agregar(`Persistencia consultable: ${servicio}`, Number.isSafeInteger(datos.filas) && datos.filas >= 0);
    } catch { agregar(`Persistencia consultable: ${servicio}`, false, 'La consulta READ ONLY no pudo completarse.'); }
  }

  if (eventId) {
    try {
      const emulador = docker('exec', '-T', 'produccion-service', 'printenv', 'PUBSUB_EMULATOR_HOST');
      const publica = docker('exec', '-T', 'produccion-service', 'printenv', 'PUBSUB_ENABLED');
      const evento = consultarBase('produccion-service', `SELECT row_to_json(e) FROM
        (SELECT event_id,correlation_id,event_type,estado,message_id FROM eventos_outbox WHERE event_id='${eventId}') e`);
      reporte.integracion.publicada = !local && !emulador && publica === 'true'
        && evento?.event_type === 'ProduccionCerrada.v1' && evento.estado === 'PUBLICADO' && Boolean(evento.message_id);
      if (reporte.integracion.publicada) reporte.integracion.evento = evento;
      if (responseEventId) {
        const resultado = consultarBase('produccion-service', `SELECT row_to_json(e) FROM
          (SELECT event_id,correlation_id,event_type,estado,payload->'data'->>'requestEventId' AS solicitud
          FROM eventos_inbox WHERE event_id='${responseEventId}') e`);
        reporte.integracion.respuestaPersistida = reporte.integracion.publicada
          && resultado?.event_type === 'RegistroContableResultado.v1' && resultado.solicitud === eventId
          && resultado.correlation_id === evento.correlation_id && resultado.estado === 'PROCESADO';
      }
    } catch { reporte.integracion.detalle = 'No se pudo verificar el evento indicado mediante READ ONLY.'; }
  }
  reporte.localAprobado = reporte.comprobaciones.every((c) => c.ok);
  // Las capturas y la demo se revisan en Jira; nunca declarar Done automáticamente.
  reporte.estadoJira = 'REQUIERE_REVISION_DE_EVIDENCIA';
  return reporte;
}

async function main() {
  const accion = process.argv[2];
  if (accion === 'iniciar-local') { iniciarLocal(); return; }
  if (!['humo-local', 'humo-gcp'].includes(accion)) {
    console.log('Uso: node scripts/sprint3.mjs iniciar-local | humo-local | humo-gcp');
    console.log('Humo: SPRINT3_TOKEN obligatorio. Opcionales: SPRINT3_GATEWAY, SPRINT3_FRONTEND, SPRINT3_DESDE, SPRINT3_HASTA.');
    console.log('GCP: SPRINT3_EVENT_ID y SPRINT3_RESPONSE_EVENT_ID verifican registros existentes; no publican mensajes.');
    return;
  }
  const reporte = await probarHumo({ token: process.env.SPRINT3_TOKEN, gateway: process.env.SPRINT3_GATEWAY,
    frontend: process.env.SPRINT3_FRONTEND, fechaDesde: process.env.SPRINT3_DESDE, fechaHasta: process.env.SPRINT3_HASTA,
    local: accion === 'humo-local', eventId: process.env.SPRINT3_EVENT_ID, responseEventId: process.env.SPRINT3_RESPONSE_EVENT_ID });
  const archivo = resolve(RAIZ, 'tmp', 'sprint3', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await mkdir(dirname(archivo), { recursive: true });
  await writeFile(archivo, JSON.stringify(reporte, null, 2) + '\n');
  for (const prueba of reporte.comprobaciones) console.log(`${prueba.ok ? 'OK' : 'FALLO'} ${prueba.nombre} ${prueba.detalle}`);
  console.log(`Informe sin tokens ni contraseñas: ${archivo}`);
  console.log('Las capturas reales de Docker y Google Pub/Sub se adjuntan por separado.');
  if (!reporte.localAprobado || (accion === 'humo-gcp' && (!reporte.integracion.publicada || !reporte.integracion.respuestaPersistida))) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); console.error('La operación se detuvo. Revisa la salida anterior y la configuración local; no compartas credenciales.'); process.exitCode = 1; });
}
