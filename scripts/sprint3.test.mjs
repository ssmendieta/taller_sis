import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearContenedores, probarHumo, iniciarLocal } from './sprint3.mjs';

// Pruebas unitarias del verificador: respuestas HTTP y Docker simuladas.
// No se presentan como evidencia de contenedores o Google reales.
const TOKEN = 'token-no-debe-aparecer-en-el-informe';
const servicios = ['postgres', 'frontend', 'api-gateway', 'auth-service', 'produccion-service', 'logistica-service'];
const filas = servicios.map((Service) => ({ Service, State: 'running', Health: Service === 'postgres' ? 'healthy' : '' }));
function entorno({ fallo = '', skipped = false, caido = '', localGcp = false } = {}) {
  const comandos = [];
  const run = (cmd, args) => {
    comandos.push([cmd, ...args]);
    let stdout = '';
    if (cmd === 'git') stdout = 'a'.repeat(40);
    else if (args.includes('ps')) stdout = JSON.stringify(filas.filter((f) => f.Service !== caido));
    else if (args.includes('printenv')) {
      const variable = args.at(-1);
      stdout = variable === 'POSTGRES_USER' ? 'postgres' : variable === 'DB_DATABASE' ? 'prueba_db'
        : variable === 'PUBSUB_ENABLED' ? 'true' : localGcp ? 'emulador:8085' : '';
    } else if (args.includes('psql')) stdout = JSON.stringify({ filas: 7 });
    return { status: 0, stdout, stderr: '' };
  };
  const fetchImpl = async (url, opciones = {}) => {
    if (String(url) === 'http://localhost:5173') return new Response('<div id="root"></div>', { headers: { 'Content-Type': 'text/html' } });
    const path = new URL(url).pathname;
    if (path.includes('/historial/') || path.includes('/reportes/') || path.endsWith('/me')) {
      assert.equal(opciones.headers.Authorization, `Bearer ${TOKEN}`);
      assert.equal(opciones.redirect, 'error');
    }
    if (path === fallo) return Response.json({ message: TOKEN, password: 'dato-que-no-se-guarda' }, { status: 403 });
    const body = path.endsWith('/health/database') ? { status: 'ok', database: skipped ? 'skipped' : 'connected' }
      : path.endsWith('/health') ? { status: 'ok' }
      : path.endsWith('/me') ? { id: 42, permisos: [], correo: 'privado@prueba.local' }
      : path.includes('/historial/') ? { items: [], total: 0 }
      : path.endsWith('/reportes/produccion') ? { filtros: {}, ordenes: [], totales: {} }
      : { filtros: {}, rutas: [], boletas: [], resumen: {} };
    return Response.json(body);
  };
  return { run, fetchImpl, comandos };
}

test('acepta los dos formatos de salida de Docker: arreglo y JSON por línea', () => {
  assert.deepEqual(parsearContenedores(JSON.stringify(filas)), filas);
  assert.deepEqual(parsearContenedores(filas.map((f) => JSON.stringify(f)).join('\n')), filas);
  assert.throws(() => parsearContenedores('no es JSON'));
});

test('comprueba tres HU y las bases sin filtrar sesión, credenciales ni respuestas completas', async () => {
  const e = entorno(); const r = await probarHumo({ token: TOKEN, ...e });
  assert.equal(r.localAprobado, true);
  assert.equal(r.comprobaciones.filter((c) => /^ABC-/.test(c.nombre) && c.ok).length, 3);
  assert.equal(r.integracion.publicada, false);
  assert.notEqual(r.estadoJira, 'Done');
  assert.doesNotMatch(JSON.stringify(r), /token-no-debe|dato-que-no-se-guarda|privado@/);
  assert.ok(e.comandos.filter((c) => c.includes('psql')).every((c) => c.at(-1).startsWith('BEGIN READ ONLY;')));
  assert.ok(e.comandos.every((c) => !c.some((a) => ['restart', 'build', 'down', 'POSTGRES_PASSWORD', 'DB_PASSWORD'].includes(a))));
});

test('un 403 en una HU impide aprobar la prueba de humo', async () => {
  const r = await probarHumo({ token: TOKEN, ...entorno({ fallo: '/api/logistica/reportes/logistica' }) });
  assert.equal(r.localAprobado, false);
  assert.equal(r.comprobaciones.find((c) => c.nombre.startsWith('ABC-110')).detalle, 'HTTP 403');
  assert.doesNotMatch(JSON.stringify(r), /token-no-debe|dato-que-no-se-guarda/);
});

test('una base omitida y un contenedor ausente se informan como fallos', async () => {
  const r = await probarHumo({ token: TOKEN, ...entorno({ skipped: true, caido: 'produccion-service' }) });
  assert.equal(r.localAprobado, false);
  assert.equal(r.comprobaciones.find((c) => c.nombre === 'Docker: produccion-service').ok, false);
  assert.equal(r.comprobaciones.find((c) => c.nombre === 'Producción: conexión PostgreSQL').ok, false);
});

test('rechaza ausencia de sesión y un eventId que podría alterar el SQL', async () => {
  await assert.rejects(probarHumo({}), /Falta SPRINT3_TOKEN/);
  await assert.rejects(probarHumo({ token: TOKEN, eventId: "'; DELETE FROM eventos_outbox; --" }), /UUID/);
});

test('distingue una publicación registrada en modo GCP de un emulador y de una respuesta no correlacionada', async () => {
  const eventId = '11111111-1111-4111-8111-111111111111';
  const responseEventId = '22222222-2222-4222-8222-222222222222';
  async function verificar(emulador, correlacion = 'conversacion') {
    const e = entorno({ localGcp: emulador });
    return probarHumo({ token: TOKEN, local: false, eventId, responseEventId, fetchImpl: e.fetchImpl,
      run: (cmd, args) => {
        if (args.includes('psql') && args.at(-1).includes('eventos_outbox')) return { status: 0, stdout: JSON.stringify({
          event_id: eventId, correlation_id: 'conversacion', event_type: 'ProduccionCerrada.v1', estado: 'PUBLICADO', message_id: '123456',
        }) };
        if (args.includes('psql') && args.at(-1).includes('eventos_inbox')) return { status: 0, stdout: JSON.stringify({
          event_id: responseEventId, correlation_id: correlacion, event_type: 'RegistroContableResultado.v1', estado: 'PROCESADO', solicitud: eventId,
        }) };
        return e.run(cmd, args);
      } });
  }
  const correcto = await verificar(false);
  assert.equal(correcto.integracion.publicada, true);
  assert.equal(correcto.integracion.respuestaPersistida, true);
  assert.equal(correcto.integracion.capturaGoogle, 'POR_ADJUNTAR');
  assert.equal((await verificar(true)).integracion.publicada, false);
  assert.equal((await verificar(false, 'otra-conversacion')).integracion.respuestaPersistida, false);
});

test('el arranque se detiene al fallar una imagen y no recrea contenedores con compilación incompleta', () => {
  const ejecutados = [];
  assert.throws(() => iniciarLocal((_cmd, args) => {
    ejecutados.push(args);
    return { status: args.includes('build') ? 1 : 0, stdout: '', stderr: '' };
  }), /Falló Docker/);
  assert.equal(ejecutados.some((c) => c.includes('up')), false);
});
