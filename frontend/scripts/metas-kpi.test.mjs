import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// Rutas, página y clientes reales; sesión y API simuladas para verificar el contrato HTTP.
const globales = ['document', 'sessionStorage', 'localStorage', 'fetch', '__sesionMetas'];
const originales = globales.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
let vite, Rutas, preparar, raiz, llamadas, datos, falloGet, falloPut;
const P = '/api/produccion/dashboard/kpis/metas';
const L = '/api/logistica/dashboard/kpis/metas';
const permisos = ['kpis.metas.gestionar', 'ordenes.consultar', 'logistica.rutas.consultar'];
const crearMetas = (nombres) => nombres.map((kpi) => ({ kpi, meta: null, unidad: '%', umbralAmarilloPct: 5, umbralRojoPct: 10, sentido: 'MAYOR_ES_MEJOR' }));
before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-metas', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) return 'export function useSesion(){return {usuario:globalThis.__sesionMetas, salir(){}};}';
    } }] });
  ({ default: Rutas } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
  ({ prepararMetaKpi: preparar } = await vite.ssrLoadModule('/src/services/metasKpi.js'));
});
beforeEach(() => {
  llamadas = []; falloGet = 0; falloPut = 0;
  datos = { [P]: crearMetas(['CUMPLIMIENTO_FECHA', 'TIEMPO_CICLO', 'FPY', 'MERMA']), [L]: crearMetas(['TIEMPO_ATENCION', 'ENTREGAS_A_TIEMPO', 'INCIDENCIAS_RUTA', 'USO_CAPACIDAD']) };
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: () => 'sesion-prueba' };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__sesionMetas = { id: 7, permisos };
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    // ABC-501: el layout consulta los avisos de KPI; no cuentan para estas pruebas.
    if (path.includes('/kpis/avisos')) return Response.json(path.endsWith('/sin-leer') ? { total: 0 } : []);
    llamadas.push({ path, ...options });
    if ((options.method ?? 'GET') === 'GET') {
      if (falloGet) return Response.json({ message: 'Error de consulta' }, { status: falloGet });
      return Response.json(datos[path]);
    }
    if (falloPut) return Response.json({ message: 'No se pudo guardar la meta' }, { status: falloPut });
    const base = path.slice(0, path.lastIndexOf('/'));
    const kpi = decodeURIComponent(path.split('/').at(-1));
    const fila = datos[base].find((m) => m.kpi === kpi);
    Object.assign(fila, JSON.parse(options.body));
    return Response.json(fila);
  };
});
afterEach(async () => { if (raiz) await act(async () => raiz.unmount()); raiz = null; });
after(async () => {
  await vite?.close();
  for (const [k, descriptor] of originales) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; }
});
const texto = (n = raiz.toJSON()) => n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(texto).join(' ') : texto(n.children);
async function abrir() { await act(async () => { raiz = Renderer.create(React.createElement(MemoryRouter, { initialEntries: ['/kpis/metas'] }, React.createElement(Rutas))); }); }
const formulario = () => raiz.root.findAllByType('form')[0];
async function escribir(sufijo, valor) { await act(async () => raiz.root.findByProps({ id: `produccion-CUMPLIMIENTO_FECHA-${sufijo}` }).props.onChange({ target: { value: valor } })); }
async function guardar() { await act(async () => formulario().props.onSubmit({ preventDefault() {} })); }

test('carga las ocho metas sin inventar cero y muestra la navegación autorizada', async () => {
  await abrir();
  assert.equal(raiz.root.findAllByType('form').length, 8);
  assert.equal(raiz.root.findByProps({ id: 'produccion-CUMPLIMIENTO_FECHA-meta' }).props.value, '');
  assert.ok(raiz.root.findAllByType('a').some((n) => n.props.href === '/kpis/metas'));
  assert.equal(llamadas.length, 2);
  assert.ok(llamadas.every((c) => c.headers.Authorization === 'Bearer sesion-prueba'));
});
test('guarda números en el área correcta y recupera la configuración al volver a abrir', async () => {
  await abrir(); await escribir('meta', '95.5'); await guardar();
  const put = llamadas.find((c) => c.method === 'PUT');
  assert.equal(put.path, `${P}/CUMPLIMIENTO_FECHA`);
  assert.deepEqual(JSON.parse(put.body), { meta: 95.5, umbralAmarilloPct: 5, umbralRojoPct: 10 });
  assert.equal(put.headers['Content-Type'], 'application/json');
  assert.match(texto(), /guardada correctamente/);
  await act(async () => raiz.unmount()); await abrir();
  assert.equal(raiz.root.findByProps({ id: 'produccion-CUMPLIMIENTO_FECHA-meta' }).props.value, 95.5);
});
test('vaciar una meta envía null y deja el KPI sin semáforo', async () => {
  datos[P][0].meta = 90;
  await abrir(); await escribir('meta', ''); await guardar();
  assert.equal(JSON.parse(llamadas.find((c) => c.method === 'PUT').body).meta, null);
  assert.match(texto(), /Meta eliminada/);
});
test('umbrales incoherentes se rechazan antes del HTTP', async () => {
  await abrir(); await escribir('rojo', '4'); await guardar();
  assert.match(texto(), /rojo debe ser mayor/);
  assert.equal(llamadas.filter((c) => c.method === 'PUT').length, 0);
});
test('sin permiso de gestión no carga datos ni muestra el enlace', async () => {
  globalThis.__sesionMetas = { id: 7, permisos: ['ordenes.consultar'] };
  await abrir();
  assert.match(texto(), /Acceso denegado/);
  assert.equal(llamadas.length, 0);
  assert.equal(raiz.root.findAllByType('a').some((n) => n.props.href === '/kpis/metas'), false);
});
test('respeta el permiso de consulta de cada área', async () => {
  globalThis.__sesionMetas = { id: 7, permisos: ['kpis.metas.gestionar', 'ordenes.consultar'] };
  await abrir();
  assert.deepEqual(llamadas.map((c) => c.path), [P]);
  assert.match(texto(), /No tienes permiso para consultar las metas de\s+Logística/);
});
test('un fallo de carga permite reintentar', async () => {
  falloGet = 500; await abrir(); assert.match(texto(), /Error de consulta/);
  falloGet = 0;
  await act(async () => raiz.root.findAllByType('button').find((n) => n.props['aria-label'] === 'Reintentar Producción').props.onClick());
  assert.equal(raiz.root.findAllByType('form').length, 4);
});
test('un rechazo 403 al guardar no confirma éxito', async () => {
  await abrir(); falloPut = 403; await escribir('meta', '90'); await guardar();
  assert.match(texto(), /No tienes permiso para consultar o modificar/);
  assert.doesNotMatch(texto(), /guardada correctamente/);
  assert.equal(datos[P][0].meta, null);
});
test('sesión expirada al consultar muestra el mensaje correspondiente', async () => {
  falloGet = 401; await abrir(); assert.match(texto(), /Tu sesión expiró/);
});
test('valida precisión, límites, no finitos y blancos de los campos obligatorios', () => {
  const base = { meta: '10', umbralAmarilloPct: '5', umbralRojoPct: '10' };
  for (const meta of ['0', '-1', 'Infinity', '10000000000', '1.12345', '1e-10']) assert.throws(() => preparar({ ...base, meta }));
  for (const umbralAmarilloPct of ['', '-1', '5.123', '10000']) assert.throws(() => preparar({ ...base, umbralAmarilloPct }));
  assert.deepEqual(preparar({ ...base, meta: '1.2345' }), { meta: 1.2345, umbralAmarilloPct: 5, umbralRojoPct: 10 });
});
