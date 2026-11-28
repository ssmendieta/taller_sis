import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

// ABC-330: widgets de boletas, rutas y entregas con filtro de período (datos de ABC-328).
let vite, Widgets, root, llamadas, responder, rankings, responderRanking;
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
  uso_capacidad: { porcentaje: 62.5, rutas_calculables: 3, rutas_no_calculables: 1,
    por_vehiculo: [
      { vehiculo_externo_id: 'VEH-1', placa: 'AAA-1', porcentaje: 75, rutas_calculables: 2, rutas_no_calculables: 0 },
      { vehiculo_externo_id: 'VEH-2', placa: null, porcentaje: null, rutas_calculables: 0, rutas_no_calculables: 1 },
    ], por_ruta: [] },
});
const kpisRecurso = (puntual, incid, uso) => ({
  entregas_a_tiempo: { porcentaje: puntual, a_tiempo: puntual === null ? 0 : 1, entregadas: puntual === null ? 0 : 2, unidad: '%' },
  incidencias_ruta: { por_100: incid, incidencias: incid === null ? 0 : 1, entregas: incid === null ? 0 : 2, unidad: 'por 100' },
  uso_capacidad: { porcentaje: uso, rutas_calculables: uso === null ? 0 : 1, rutas_no_calculables: 0 },
});
const ranking = (dimension) => ({ dimension, periodo: { desde: null, hasta: null },
  filas: [
    { id: 'CHO-1', nombre: 'Ana', ...kpisRecurso(90, 5, 40), sin_datos: false },
    { id: 'CHO-2', nombre: 'Luis', ...kpisRecurso(50, 20, 80), sin_datos: false },
    { id: 'CHO-3', nombre: 'Eva', ...kpisRecurso(70, 10, 60), sin_datos: false },
    { id: 'CHO-4', nombre: null, ...kpisRecurso(null, null, null), sin_datos: true },
  ],
  totales: kpisRecurso(70, 11.67, 60) });

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'css-vacio', enforce: 'pre', load(id) { if (id.endsWith('.css')) return ''; } }] });
  const { default: W } = await vite.ssrLoadModule('/src/components/logistica/dashboard/WidgetsDashboardLogistica.jsx');
  const { MemoryRouter } = await vite.ssrLoadModule('react-router-dom');
  // El widget enlaza al detalle de KPI: necesita un router.
  Widgets = () => React.createElement(MemoryRouter, null, React.createElement(W));
});
beforeEach(() => {
  llamadas = [];
  rankings = [];
  responderRanking = (params) => json(ranking(params.get('dimension')));
  // Sin filtro ("Todo") devuelve el doble que un período acotado.
  responder = (params) => json(metricas(params.get('desde') ? 1 : 2));
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    // Solo se registran las métricas; el ranking (ABC-430) tiene su propia lista.
    if (u.pathname.endsWith('/kpis/ranking')) { rankings.push(Object.fromEntries(u.searchParams)); return responderRanking(u.searchParams); }
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

// ABC-423: widget de uso de capacidad.
test('uso de capacidad: valor general, barras por vehículo y no calculables', async () => {
  await montar();
  assert.match(texto(), /Uso de capacidad/);
  assert.match(texto(), /62,5%/);
  assert.match(texto(), /AAA-1/);
  assert.match(texto(), /No calculable/);
  assert.match(texto(), /1 ruta no es calculable/);
});

test('uso de capacidad: el enlace al detalle conserva el período', async () => {
  await montar();
  const enlace = root.root.findAll((n) => n.type === 'a' && String(n.props.href).startsWith('/logistica/kpis/USO_CAPACIDAD'))[0];
  assert.match(enlace.props.href, /desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}/);
});

// ABC-491: un 0 % es un valor calculado; no se confunde con "No calculable" ni con "Sin datos".
const conUso = (uso) => () => { const m = metricas(1); m.uso_capacidad = uso; return json(m); };
const widgetUso = () => root.root.find((n) => n.props?.['aria-labelledby'] === 'dash-uso-titulo');
const filasUso = () => widgetUso().findAll((n) => n.type === 'li' && n.props.className === 'dash-barra-fila').map((fila) => ({
  vehiculo: fila.findByProps({ className: 'dash-barra-etiqueta' }).children.join(''),
  valor: fila.findByProps({ className: 'dash-barra-valor' }).children.join(''),
  barras: fila.findAll((n) => n.props?.className === 'dash-barra').length,
}));

test('uso de capacidad: 0 % se muestra como 0 % y no como "No calculable"', async () => {
  responder = conUso({ porcentaje: 0, rutas_calculables: 1, rutas_no_calculables: 1, por_ruta: [], por_vehiculo: [
    { vehiculo_externo_id: 'VEH-0', placa: 'CERO-1', porcentaje: 0, rutas_calculables: 1, rutas_no_calculables: 0 },
    { vehiculo_externo_id: 'VEH-X', placa: 'NOCALC-1', porcentaje: null, rutas_calculables: 0, rutas_no_calculables: 1 },
  ] });
  await montar();
  assert.equal(widgetUso().findByProps({ className: 'dash-grafico-total' }).children.join(''), '0%');
  assert.deepEqual(filasUso(), [
    { vehiculo: 'CERO-1', valor: '0%', barras: 0 },
    { vehiculo: 'NOCALC-1', valor: 'No calculable', barras: 0 },
  ]);
});

test('uso de capacidad: sin rutas en el período muestra "Sin datos", no 0 %', async () => {
  responder = conUso({ porcentaje: null, rutas_calculables: 0, rutas_no_calculables: 0, por_ruta: [], por_vehiculo: [] });
  await montar();
  assert.equal(widgetUso().findByProps({ className: 'dash-grafico-total' }).children.join(''), 'Sin datos');
  assert.match(JSON.stringify(widgetUso().findByProps({ className: 'ts-empty' }).children), /Sin rutas despachadas en el período/);
  assert.equal(filasUso().length, 0);
});

// ABC-430 / ABC-531: ranking de choferes y vehículos.
const celdas = () => root.root.findAll((n) => n.type === 'tr' && n.parent?.type === 'tbody' && n.findAll((x) => x.type === 'th').length === 1
  && n.findAll((x) => x.type === 'a' && String(x.props.href).includes('ENTREGAS_A_TIEMPO')).length === 1);
const nombres = () => celdas().map((tr) => tr.findByType('th').children.join(''));

test('ranking: una fila por chofer, total y "sin datos"', async () => {
  await montar();
  assert.equal(rankings[0].dimension, 'CHOFER');
  // Orden inicial alfabético por nombre (o código si no se conoce el nombre).
  assert.deepEqual(nombres(), ['Ana (CHO-1)', 'CHO-4', 'Eva (CHO-3)', 'Luis (CHO-2)']);
  assert.match(texto(), /Sin datos en el período/);
  assert.match(texto(), /Total/);
});

test('ranking: mejor y peor de cada columna según su sentido, con texto', async () => {
  await montar();
  const marcadas = root.root.findAll((n) => n.type === 'td' && n.props['data-marca'])
    .map((td) => `${td.props['data-marca']}:${td.children[0]}`);
  // Puntualidad: más es mejor. Incidencias: menos es mejor. Uso: más es mejor.
  assert.ok(marcadas.includes('Mejor:90% (1 de 2)'));
  assert.ok(marcadas.includes('Peor:50% (1 de 2)'));
  assert.ok(marcadas.includes('Mejor:5 (1 en 2)'));
  assert.ok(marcadas.includes('Peor:20 (1 en 2)'));
  assert.ok(marcadas.includes('Mejor:80%'));
  assert.ok(marcadas.includes('Peor:40%'));
});

test('ranking: ordena por cualquier columna y deja sin datos al final', async () => {
  await montar();
  const ordenar = (titulo) => root.root.find((n) => n.type === 'button' && String(n.children[0]).startsWith(titulo)).props.onClick();
  await act(async () => ordenar('Incidencias por 100 entregas'));
  assert.deepEqual(nombres(), ['Ana (CHO-1)', 'Eva (CHO-3)', 'Luis (CHO-2)', 'CHO-4']);
  await act(async () => ordenar('Incidencias por 100 entregas'));
  assert.deepEqual(nombres(), ['Luis (CHO-2)', 'Eva (CHO-3)', 'Ana (CHO-1)', 'CHO-4']);
  await act(async () => ordenar('Uso de capacidad'));
  assert.deepEqual(nombres(), ['Ana (CHO-1)', 'Eva (CHO-3)', 'Luis (CHO-2)', 'CHO-4']);
});

test('ranking: cambiar a vehículos y al período vuelve a consultar', async () => {
  await montar();
  await act(async () => boton('Por vehículo').props.onClick());
  assert.equal(rankings.at(-1).dimension, 'VEHICULO');
  await act(async () => boton('Todo').props.onClick());
  assert.deepEqual(rankings.at(-1), { dimension: 'VEHICULO' });
});

test('ranking: cada fila enlaza a sus entregas con el período (ABC-531)', async () => {
  await montar();
  const href = celdas()[0].findByType('a').props.href;
  assert.match(href, /^\/logistica\/kpis\/ENTREGAS_A_TIEMPO\?chofer=CHO-1&desde=\d{4}-\d{2}-\d{2}&hasta=/);
});

test('ranking: un error se informa sin ocultar los widgets', async () => {
  responderRanking = () => json({ message: 'Ranking caído' }, 500);
  await montar();
  assert.match(texto(), /Ranking caído/);
  assert.match(texto(), /Boletas por estado/);
});

test('ranking: lista vacía muestra mensaje informativo (ABC-521)', async () => {
  responderRanking = () => json({
    dimension: 'CHOFER',
    periodo: { desde: null, hasta: null },
    filas: [],
    totales: {
      entregas_a_tiempo: { porcentaje: null, a_tiempo: 0, entregadas: 0, unidad: '%' },
      incidencias_ruta: { por_100: null, incidencias: 0, entregas: 0, unidad: 'por 100' },
      uso_capacidad: { porcentaje: null, rutas_calculables: 0, rutas_no_calculables: 0 },
    },
  });
  await montar();
  assert.match(texto(), /No hay choferes ni vehículos registrados/);
});
