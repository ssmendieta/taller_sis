import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createServer } from 'vite';

let vite, useConsulta, Pagina, root, estado, llamadas, pendientes, post, hook;
const originales = Object.fromEntries(['fetch', 'document', 'window', 'sessionStorage', 'localStorage', 'setTimeout', 'clearTimeout'].map(k => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const consulta = (cambios = {}) => ({ orden_id: 15, estado_consulta: 'PENDIENTE',
  consulta_id: 'DISP-ORD-15-V1', consulta_version: 1, request_event_id: 'evento-15', correlation_id: 'correlacion-15',
  respuesta_esperada_hasta: new Date(Date.now() + 20000).toISOString(),
  materiales: [{ material_id: 8, codigo: 'HAR-001', nombre: 'Harina', unidad_medida: 'kg', cantidad_requerida: 1, cantidad_disponible: null, estado: 'PENDIENTE' }], ...cambios });
function Harness({ id = '15' }) { hook = useConsulta(id); return React.createElement('p', null, hook.estado, hook.error, hook.aviso); }

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' }, plugins: [{ name: 'sesion-disponibilidad-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) return 'export function useSesion(){return {usuario: globalThis.__usuarioDisponibilidad};}';
    } }] });
  ({ default: useConsulta } = await vite.ssrLoadModule('/src/hooks/useDisponibilidadOrden.js'));
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/OrdenDetallePage.jsx'));
});
beforeEach(() => {
  llamadas = []; pendientes = new Map(); let timer = 0;
  globalThis.setTimeout = (fn, ms, ...args) => ms === 1000 ? (pendientes.set(++timer, fn), timer) : originales.setTimeout(fn, ms, ...args);
  globalThis.clearTimeout = id => { if (!pendientes.delete(id)) originales.clearTimeout(id); };
  globalThis.document = { title: '' }; globalThis.window = {};
  globalThis.sessionStorage = { getItem: k => k === 'accessToken' ? 'token-prueba' : null };
  globalThis.localStorage = { getItem() { throw new Error('La sesión ya tiene token'); } };
  globalThis.__usuarioDisponibilidad = { id: '42', rol: 'Encargado de Producción', permisos: ['ordenes.consultar', 'ordenes.iniciar', 'ordenes.cambiar_estado', 'materiales.consultar_disponibilidad', 'recetas.gestionar'] };
  estado = { orden_id: 15, estado_consulta: 'SIN_CONSULTA', materiales: [] };
  post = async () => json(estado = consulta(), 202);
  globalThis.fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    llamadas.push({ path, method: opts.method || 'GET', headers: opts.headers });
    if (path.endsWith('/disponibilidad-materiales/consultar')) return post();
    if (path.endsWith('/disponibilidad-materiales')) return json(estado);
    if (path.endsWith('/ordenes/15')) return json({ id: 15, codigo: 'ORD-2026-00005', estado: 'PLANIFICADA', producto_id: 2, cantidad: 1 });
    if (path.endsWith('/materiales')) return json(consulta().materiales.length ? { materiales: consulta().materiales } : []);
    if (path.endsWith('/recetas')) return json([{ id: 2, activa: false }]);
    if (path.includes('/cierre')) return json({ message: 'Sin cierre' }, 404);
    return json([]);
  };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; pendientes.clear(); });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); delete globalThis.__usuarioDisponibilidad; });
async function montar(id = '15') { await act(async () => { root = Renderer.create(React.createElement(Harness, { id })); }); }
async function tick() { const [id, fn] = pendientes.entries().next().value; pendientes.delete(id); await act(async () => { await fn(); }); }
const posts = () => llamadas.filter(x => x.method === 'POST');

test('envía POST con Bearer, muestra pendiente y bloquea doble clic antes y después del 202', async () => {
  await montar();
  let confirmar; post = () => new Promise(resolve => { confirmar = () => resolve(json(estado = consulta(), 202)); });
  let envio;
  await act(async () => { envio = hook.solicitar(); void hook.solicitar(); });
  assert.equal(posts().length, 1); assert.equal(hook.bloqueada, true);
  assert.equal(posts()[0].path, '/api/produccion/ordenes/15/disponibilidad-materiales/consultar');
  assert.equal(posts()[0].headers.Authorization, 'Bearer token-prueba');
  await act(async () => { confirmar(); await envio; });
  await act(async () => hook.solicitar());
  assert.equal(posts().length, 1); assert.equal(hook.estado, 'PENDIENTE');
  assert.doesNotMatch(hook.aviso, /respondió/);
});
test('reanuda una consulta pendiente al abrir y muestra exclusivamente la respuesta recibida', async () => {
  estado = consulta(); await montar();
  assert.equal(posts().length, 0); assert.equal(hook.bloqueada, true);
  estado = consulta({ estado_consulta: 'RESPONDIDA', materiales: [{ material_id: 8, cantidad_disponible: 0.75, estado: 'INSUFICIENTE', unidad_medida: 'kg' }] });
  await tick();
  assert.equal(hook.estado, 'RESPONDIDA'); assert.match(hook.aviso, /Inventarios respondió/);
  assert.equal(hook.datos.materiales[0].cantidad_disponible, 0.75); assert.equal(pendientes.size, 0);
});
for (const [nombre, cambios, mensaje] of [
  ['fallo de publicación', { publicacion: { estado: 'PENDIENTE', ultimo_error: 'UNAVAILABLE' } }, /No se pudo publicar/],
  ['tiempo vencido', { respuesta_esperada_hasta: new Date(0).toISOString() }, /tiempo de espera/],
  ['respuesta inválida', { error_respuesta: 'Inventarios devolvió una respuesta no válida' }, /respuesta no válida/],
]) test(`${nombre}: conserva pendiente y permite reintentar sin inventar cantidades`, async () => {
  estado = consulta(cambios); await montar();
  assert.equal(hook.estado, 'PENDIENTE'); assert.match(hook.error, mensaje); assert.equal(hook.bloqueada, false);
  assert.equal(hook.datos.materiales[0].cantidad_disponible, null);
  await act(async () => hook.solicitar()); assert.equal(posts().length, 1);
});
test('error HTTP real se muestra y permite reintentar', async () => {
  await montar(); post = async () => json({ message: 'No tiene permiso para consultar disponibilidad' }, 403);
  await act(async () => hook.solicitar()); assert.match(hook.error, /No tiene permiso/);
  assert.equal(hook.estado, 'SIN_CONSULTA'); assert.equal(hook.bloqueada, false);
});
test('no acepta una respuesta de otra orden ni una correlación diferente', async () => {
  estado = consulta(); await montar();
  estado = consulta({ estado_consulta: 'RESPONDIDA', correlation_id: 'otra' }); await tick();
  assert.match(hook.error, /correlación/); assert.equal(hook.estado, 'PENDIENTE');
  await act(async () => { root.update(React.createElement(Harness, { id: '16' })); });
  assert.match(hook.error, /no corresponde a esta orden/); assert.equal(hook.datos, null);
});
test('al cambiar de orden ignora respuestas tardías y cancela el seguimiento anterior', async () => {
  estado = consulta(); await montar();
  let resolver; const anterior = globalThis.fetch;
  globalThis.fetch = url => String(url).includes('/15/') ? new Promise(resolve => { resolver = resolve; }) : anterior(url);
  const [timer, fn] = pendientes.entries().next().value; pendientes.delete(timer);
  await act(async () => { void fn(); });
  estado = { orden_id: 16, estado_consulta: 'SIN_CONSULTA', materiales: [] };
  await act(async () => root.update(React.createElement(Harness, { id: '16' })));
  await act(async () => resolver(json(consulta({ estado_consulta: 'RESPONDIDA' }))));
  assert.equal(hook.datos.orden_id, 16); assert.equal(hook.estado, 'SIN_CONSULTA'); assert.equal(pendientes.size, 0);
});
test('pantalla real conserva receta inactiva e inicio bloqueado al consultar disponibilidad', async () => {
  await act(async () => { root = Renderer.create(React.createElement(MemoryRouter, { initialEntries: ['/ordenes/15'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    React.createElement(Routes, null, React.createElement(Route, { path: '/ordenes/:id', element: React.createElement(Pagina) })))); });
  const buscar = texto => root.root.findAllByType('button').find(b => b.children.join('') === texto);
  assert.ok(buscar('Solicitar disponibilidad'));
  await act(async () => buscar('Solicitar disponibilidad').props.onClick());
  assert.equal(buscar('Consultando…').props.disabled, true);
  estado = consulta({ estado_consulta: 'RESPONDIDA', materiales: [{ ...consulta().materiales[0], cantidad_disponible: 2, estado: 'SUFICIENTE' }] });
  await tick();
  const texto = JSON.stringify(root.toJSON());
  assert.match(texto, /SUFICIENTE|Suficiente/); assert.match(texto, /receta de esta orden está inactiva/);
  assert.equal(buscar('Iniciar producción')?.props.disabled, true);
  assert.ok(llamadas.every(x => x.method === 'GET' || x.path.endsWith('/disponibilidad-materiales/consultar')));
});
test('pantalla sin permiso no ofrece solicitar disponibilidad', async () => {
  globalThis.__usuarioDisponibilidad.permisos = ['ordenes.consultar'];
  await act(async () => { root = Renderer.create(React.createElement(MemoryRouter, { initialEntries: ['/ordenes/15'] },
    React.createElement(Routes, null, React.createElement(Route, { path: '/ordenes/:id', element: React.createElement(Pagina) })))); });
  assert.equal(root.root.findAllByType('button').filter(b => b.children.join('') === 'Solicitar disponibilidad').length, 0);
});
