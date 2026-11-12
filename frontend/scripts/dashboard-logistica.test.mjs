import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

// ABC-330: widgets de boletas, rutas y entregas con filtro de período (datos de ABC-328).
let vite, Widgets, root, llamadas, responder;
const originales = Object.fromEntries(['fetch', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const metricas = (n) => ({
  periodo: { desde: null, hasta: null },
  resumen: { total_boletas: 6 * n, boletas_emitidas: 4 * n, rutas_en_curso: n, rutas_planificadas: 2 * n, porcentaje_entregas_completadas: n === 1 ? 50 : 75, total_incidencias: n },
  boletas_por_estado: { BORRADOR: n, EMITIDA: 4 * n, ANULADA: n, total: 6 * n },
  rutas_por_estado: { PLANIFICADA: 2 * n, DESPACHADA: n, COMPLETADA: n, CANCELADA: 0, total: 4 * n },
  entregas: { total_paradas: 4 * n, entregadas: 2 * n, pendientes: 2 * n, anuladas: 0, porcentaje_efectividad: 50 },
  incidencias: { boletas_anuladas: n, rutas_canceladas: 0, entregas_anuladas: 0, total: n },
  volumen_carga: { total_items: 0, cantidad_total: 0 },
});

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'css-vacio', enforce: 'pre', load(id) { if (id.endsWith('.css')) return ''; } }] });
  ({ default: Widgets } = await vite.ssrLoadModule('/src/components/logistica/dashboard/WidgetsDashboardLogistica.jsx'));
});
beforeEach(() => {
  llamadas = [];
  // Sin filtro ("Todo") devuelve el doble que un período acotado.
  responder = (params) => json(metricas(params.get('desde') ? 1 : 2));
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    llamadas.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), auth: opts.headers?.Authorization });
    return responder(u.searchParams);
  };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); });

async function montar() {
  await act(async () => { root = Renderer.create(React.createElement(Widgets)); });
}
const texto = () => JSON.stringify(root.toJSON());
const boton = (etiqueta) => root.root.find((n) => n.type === 'button' && n.children.includes(etiqueta));
const anchos = () => root.root.findAll((n) => n.props?.className === 'dash-barra').map((n) => n.props.style.width);
const cifra = (titulo) => {
  const tarjeta = root.root.findAll((n) => n.props?.className === 'dash-cifra').find((n) => n.children[0].children[0] === titulo);
  return tarjeta.children[1].children.join('');
};

test('carga los últimos 30 días por el gateway con el token', async () => {
  await montar();
  assert.equal(llamadas[0].path, '/api/logistica/dashboard/metricas');
  assert.equal(llamadas[0].auth, 'Bearer token-prueba');
  assert.match(llamadas[0].params.desde, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(llamadas[0].params.hasta, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(cifra('Rutas en tránsito'), '1');
  assert.match(texto(), /Boletas por estado/);
  assert.match(texto(), /Rutas por estado/);
  assert.match(texto(), /Entregas por estado/);
});

test('los widgets cambian al filtrar el período', async () => {
  await montar();
  const antes = { rutas: cifra('Rutas en tránsito'), entregas: cifra('Entregas completadas'), emitidas: cifra('Boletas emitidas') };
  await act(async () => boton('Todo').props.onClick());
  assert.deepEqual(llamadas.at(-1).params, {});
  assert.notDeepEqual(
    { rutas: cifra('Rutas en tránsito'), entregas: cifra('Entregas completadas'), emitidas: cifra('Boletas emitidas') }, antes);
  assert.equal(cifra('Boletas emitidas'), '8');
  assert.equal(cifra('Entregas completadas'), '75%');
});

test('un período personalizado envía desde y hasta', async () => {
  await montar();
  const [desde, hasta] = ['dash-desde', 'dash-hasta'].map((id) => root.root.findByProps({ id }));
  await act(async () => desde.props.onChange({ target: { value: '2026-11-01' } }));
  await act(async () => hasta.props.onChange({ target: { value: '2026-11-10' } }));
  await act(async () => root.root.find((n) => n.type === 'form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(llamadas.at(-1).params, { desde: '2026-11-01', hasta: '2026-11-10' });
});

test('un rango invertido se rechaza en pantalla sin consultar', async () => {
  await montar();
  const antes = llamadas.length;
  await act(async () => root.root.findByProps({ id: 'dash-desde' }).props.onChange({ target: { value: '2026-11-10' } }));
  await act(async () => root.root.findByProps({ id: 'dash-hasta' }).props.onChange({ target: { value: '2026-11-01' } }));
  await act(async () => root.root.find((n) => n.type === 'form').props.onSubmit({ preventDefault() {} }));
  assert.equal(llamadas.length, antes);
  assert.match(texto(), /no puede ser posterior/);
});

test('las barras son proporcionales al mayor valor y muestran el número', async () => {
  await montar();
  // Boletas: emitidas 4 (100 %), borrador 1 (25 %), anuladas 1 (25 %).
  assert.deepEqual(anchos().slice(0, 3), ['100%', '25%', '25%']);
  assert.match(texto(), /"Emitidas"/);
});

test('al pasar el mouse muestra cantidad, total y porcentaje', async () => {
  await montar();
  const fila = root.root.findAll((n) => n.props?.className === 'dash-barra-fila')[0];
  await act(async () => fila.props.onMouseEnter());
  assert.match(texto(), /Emitidas: 4 de 6 \(67%\)/);
});

test('ofrece la vista de tabla con los mismos datos', async () => {
  await montar();
  await act(async () => root.root.findAll((n) => n.type === 'button' && n.children.includes('Ver tabla'))[0].props.onClick());
  assert.ok(root.root.findAll((n) => n.type === 'table').length >= 1);
  assert.match(texto(), /67%/);
});

test('un período sin datos muestra el estado vacío', async () => {
  responder = () => json({ ...metricas(1), boletas_por_estado: { BORRADOR: 0, EMITIDA: 0, ANULADA: 0, total: 0 } });
  await montar();
  assert.match(texto(), /Sin boletas en el período/);
});

test('un error se informa y permite reintentar', async () => {
  responder = () => json({ message: 'La fecha "desde" debe tener formato de fecha válido' }, 400);
  await montar();
  assert.match(texto(), /formato de fecha válido/);
  responder = () => json(metricas(1));
  await act(async () => boton('Reintentar').props.onClick());
  assert.match(texto(), /Boletas por estado/);
});
