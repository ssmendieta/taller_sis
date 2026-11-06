import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';

let vite, obtenerMetricasDashboard;
const originales = Object.fromEntries(
  ['fetch', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]),
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, '..');

before(async () => {
  vite = await createServer({
    root: frontendRoot,
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const modulo = await vite.ssrLoadModule('/src/services/dashboardService.js');
  obtenerMetricasDashboard = modulo.obtenerMetricasDashboard;
});

after(async () => {
  await vite?.close();
  Object.assign(globalThis, originales);
});

let peticiones = [];

beforeEach(() => {
  peticiones = [];
  globalThis.sessionStorage = {
    getItem: (k) => (k === 'accessToken' ? 'token-supervisor-123' : null),
  };
  globalThis.localStorage = { getItem: () => null };
});

test('obtenerMetricasDashboard envía token Bearer y consulta /api/produccion/dashboard/metricas', async () => {
  globalThis.fetch = async (url, opts = {}) => {
    peticiones.push({ url, opts });
    return new Response(
      JSON.stringify({
        resumen: { total_ordenes: 5 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const datos = await obtenerMetricasDashboard();

  assert.equal(peticiones.length, 1);
  const llamada = peticiones[0];
  assert.ok(llamada.url.includes('/api/produccion/dashboard/metricas'));
  assert.equal(llamada.opts.headers.Authorization, 'Bearer token-supervisor-123');
  assert.equal(datos.resumen.total_ordenes, 5);
});

test('obtenerMetricasDashboard agrega parámetros "desde" y "hasta" a la URL', async () => {
  globalThis.fetch = async (url, opts = {}) => {
    peticiones.push({ url, opts });
    return new Response(
      JSON.stringify({
        periodo: { desde: '2026-10-01', hasta: '2026-10-31' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const datos = await obtenerMetricasDashboard({
    desde: '2026-10-01',
    hasta: '2026-10-31',
  });

  assert.equal(peticiones.length, 1);
  const urlParsed = new URL(peticiones[0].url);
  assert.equal(urlParsed.searchParams.get('desde'), '2026-10-01');
  assert.equal(urlParsed.searchParams.get('hasta'), '2026-10-31');
  assert.equal(datos.periodo.desde, '2026-10-01');
});

test('obtenerMetricasDashboard lanza un error con el mensaje de la API si la respuesta falla', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        message: 'El rango de fechas es inválido: la fecha "desde" no puede ser posterior a la fecha "hasta".',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );

  await assert.rejects(
    async () => {
      await obtenerMetricasDashboard({ desde: '2026-11-20', hasta: '2026-11-01' });
    },
    (err) => {
      assert.ok(err.message.includes('rango de fechas es inválido'));
      assert.equal(err.status, 400);
      return true;
    },
  );
});
