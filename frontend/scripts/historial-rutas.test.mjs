import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// ABC-392: listado y filtros del historial de rutas.
let vite, Pagina, root, llamadas, respuesta;
const originales = Object.fromEntries(['fetch', 'document', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const ruta = (id, cambios = {}) => ({
  id: String(id), fechaProgramada: '2026-11-10', estado: 'PLANIFICADA',
  vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-07', totalParadas: 2, totalBoletas: 3, ...cambios,
});

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-historial-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) return 'export function useSesion(){return {usuario: globalThis.__usuarioHistorial};}';
    } }] });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/HistorialLogisticoPage.jsx'));
});
beforeEach(() => {
  llamadas = [];
  respuesta = (params) => json({
    items: [ruta(5, { estado: 'DESPACHADA', choferExternoId: 'CHO-12' }), ruta(4)],
    total: 12, page: Number(params.get('page')), limit: Number(params.get('limit')), totalPages: 3,
  });
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__usuarioHistorial = { id: '4', permisos: ['logistica.rutas.consultar'] };
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    llamadas.push({ path: u.pathname, params: u.searchParams, auth: opts.headers?.Authorization });
    return respuesta(u.searchParams);
  };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); delete globalThis.__usuarioHistorial; });

async function montar() {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, null, React.createElement(Pagina)));
  });
}
const texto = () => JSON.stringify(root.toJSON());
const ultima = () => Object.fromEntries(llamadas.at(-1).params);
async function cambiar(id, value) {
  await act(async () => root.root.findByProps({ id }).props.onChange({ target: { value } }));
}
async function aplicar() {
  const form = root.root.find((n) => n.type === 'form');
  await act(async () => form.props.onSubmit({ preventDefault() {} }));
}
const boton = (etiqueta) => root.root.find((n) => n.type === 'button' && n.children.includes(etiqueta));

test('carga la primera página por el gateway con el token', async () => {
  await montar();
  assert.equal(llamadas[0].path, '/api/logistica/historial/rutas');
  assert.equal(llamadas[0].auth, 'Bearer token-prueba');
  assert.deepEqual(ultima(), { page: '1', limit: '10' });
  assert.match(texto(), /12 rutas/);
  assert.match(texto(), /Despachada/);
  assert.match(texto(), /10\/11\/2026/);
});

test('envía los filtros combinados y vuelve a la página 1', async () => {
  await montar();
  await cambiar('historial-desde', '2026-11-01');
  await cambiar('historial-hasta', '2026-11-30');
  await cambiar('historial-estado', 'DESPACHADA');
  await cambiar('historial-chofer', '  CHO-12 ');
  await aplicar();
  assert.deepEqual(ultima(), {
    page: '1', limit: '10', fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estado: 'DESPACHADA', chofer: 'CHO-12',
  });
});

test('al cambiar de página conserva los filtros aplicados', async () => {
  await montar();
  await cambiar('historial-estado', 'PLANIFICADA');
  await aplicar();
  await act(async () => boton('Siguiente').props.onClick());
  assert.deepEqual(ultima(), { page: '2', limit: '10', estado: 'PLANIFICADA' });
});

test('limpiar filtros vuelve a la consulta sin filtros', async () => {
  await montar();
  await cambiar('historial-chofer', 'CHO-12');
  await aplicar();
  await act(async () => boton('Limpiar filtros').props.onClick());
  assert.deepEqual(ultima(), { page: '1', limit: '10' });
});

test('rechaza en pantalla un rango de fechas invertido sin consultar', async () => {
  await montar();
  const antes = llamadas.length;
  await cambiar('historial-desde', '2026-11-10');
  await cambiar('historial-hasta', '2026-11-01');
  await aplicar();
  assert.equal(llamadas.length, antes);
  assert.match(texto(), /no puede ser posterior/);
});

test('cada ruta enlaza a su detalle', async () => {
  await montar();
  const enlaces = root.root.findAll((n) => n.props?.to?.startsWith?.('/logistica/rutas/'));
  assert.deepEqual(enlaces.map((n) => n.props.to).filter((v, i, a) => a.indexOf(v) === i), ['/logistica/rutas/5', '/logistica/rutas/4']);
});

test('sin resultados muestra el estado vacío', async () => {
  respuesta = () => json({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
  await montar();
  assert.match(texto(), /No hay rutas que cumplan los filtros/);
});

test('un error se muestra y permite reintentar', async () => {
  respuesta = () => json({ message: 'fechaDesde no puede ser posterior a fechaHasta' }, 400);
  await montar();
  assert.match(texto(), /fechaDesde no puede ser posterior/);
  respuesta = () => json({ items: [ruta(1)], total: 1, page: 1, limit: 10, totalPages: 1 });
  await act(async () => boton('Reintentar').props.onClick());
  assert.match(texto(), /1 ruta/);
});

test('sin permiso no consulta y lo informa', async () => {
  globalThis.__usuarioHistorial = { id: '9', permisos: ['ordenes.consultar'] };
  await montar();
  assert.equal(llamadas.length, 0);
  assert.match(texto(), /No tienes permiso para consultar rutas/);
});
