import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

let vite, Pagina, Rutas, servicio, root, llamadas, responder;
const originales = Object.fromEntries(['fetch', 'document', 'sessionStorage', 'localStorage'].map((key) => [key, globalThis[key]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const cantidades = {
  solicitada: '100.0000', producida: '80.1234', conforme: '60.0000', defectuosa: '20.1234',
  reprocesada: '10.0000', recuperada: '8.0000', descartada: '2.0000',
};
function reporte(producto = null) {
  return {
    filtros: { fechaDesde: null, fechaHasta: null, producto, campoFecha: 'fecha_programada' },
    ordenes: [{ ordenId: 42, codigo: producto || 'ORD-42', fechaProgramada: '2026-11-02',
      producto: { recetaId: 3, codigo: 'PAN-01', nombre: 'Pan histórico', unidad: 'kg' },
      fuente: 'CIERRE', cierre: { id: '9007199254740993', version: 2 }, cantidades: { ...cantidades },
      consumos: [{ materialId: '9007199254740994', unidad: 'kg', cantidad: '3.1000' }, { materialId: '9007199254740994', unidad: 'g', cantidad: '4.0000' }],
      perdidas: [{ materialId: '2', unidad: 'g', cantidad: '0.0001' }],
    }],
    // Totales deliberadamente distintos del detalle: la vista debe usar los del servidor.
    totales: { ordenes: 7,
      productos: [
        { producto: { recetaId: 3, codigo: 'PAN-01', nombre: 'Pan histórico', unidad: 'kg' }, cantidades: { ...cantidades, producida: '19999999999.9999' } },
        { producto: { recetaId: 4, codigo: 'PAN-01', nombre: 'Otra receta', unidad: 'g' }, cantidades: { ...cantidades, producida: '0.0001' } },
      ],
      consumos: [{ materialId: '9007199254740994', unidad: 'kg', cantidad: '19999999999.9999' }, { materialId: '9007199254740994', unidad: 'g', cantidad: '4.0000' }],
      perdidas: [{ materialId: '2', unidad: 'g', cantidad: '0.0002' }],
    },
  };
}
const vacio = { filtros: { fechaDesde: null, fechaHasta: null, producto: null, campoFecha: 'fecha_programada' },
  ordenes: [], totales: { ordenes: 0, productos: [], consumos: [], perdidas: [] } };

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-reportes-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
        return 'export function useSesion(){return {usuario: globalThis.__usuarioReporte, salir(){}};}';
      }
    } }] });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/ReportesProduccionPage.jsx'));
  ({ default: Rutas } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
  servicio = await vite.ssrLoadModule('/src/services/reportesProduccionService.js');
});
beforeEach(() => {
  llamadas = [];
  responder = () => json(reporte());
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (key) => key === 'accessToken' ? 'token-prueba' : null };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__usuarioReporte = { id: '7', permisos: ['ordenes.consultar'] };
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    llamadas.push({ url: parsed, options });
    return responder(parsed.searchParams, options);
  };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); delete globalThis.__usuarioReporte; });
async function montar(Component = Pagina, path = '/') {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component)));
  });
}
const textoNodo = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(textoNodo).join('');
const texto = () => textoNodo(root.toJSON());
const ultima = () => Object.fromEntries(llamadas.at(-1).url.searchParams);
const boton = (etiqueta) => root.root.find((node) => node.type === 'button' && node.children.includes(etiqueta));
const tabla = (caption) => root.root.findAllByType('table').find((node) => node.findByType('caption').children.includes(caption));
async function cambiar(id, value) {
  await act(async () => root.root.findByProps({ id }).props.onChange({ target: { value } }));
}
async function aplicar() {
  await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
}

test('consulta la ruta exacta del gateway con autenticacion y sin parametros vacios', async () => {
  await montar();
  assert.equal(llamadas[0].url.pathname, '/api/produccion/reportes/produccion');
  assert.equal(llamadas[0].url.search, '');
  assert.equal(llamadas[0].options.headers.Authorization, 'Bearer token-prueba');
  assert.equal(llamadas[0].options.signal.aborted, false);
});
test('aplica solo fechaDesde, fechaHasta y producto normalizado', async () => {
  await montar();
  await cambiar('reporte-desde', '2024-02-29');
  await cambiar('reporte-hasta', '2024-03-01');
  await cambiar('reporte-producto', '  Pan %_  ');
  await aplicar();
  assert.deepEqual(ultima(), { fechaDesde: '2024-02-29', fechaHasta: '2024-03-01', producto: 'Pan %_' });
  await act(async () => boton('Limpiar filtros').props.onClick());
  assert.deepEqual(ultima(), {});
});
test('omite filtros blancos y acepta extremos individuales', async () => {
  await servicio.consultarReporteProduccion({ fechaDesde: '', fechaHasta: null, producto: '  ' });
  assert.deepEqual(ultima(), {});
  await servicio.consultarReporteProduccion({ fechaHasta: '2026-11-01' });
  assert.deepEqual(ultima(), { fechaHasta: '2026-11-01' });
});
test('reutiliza el token persistido cuando no hay token de sesion', async () => {
  globalThis.sessionStorage = { getItem: () => null };
  globalThis.localStorage = { getItem: () => 'token-persistido' };
  await servicio.consultarReporteProduccion();
  assert.equal(llamadas[0].options.headers.Authorization, 'Bearer token-persistido');
});
test('rechaza fechas irreales, intervalos invertidos y producto largo antes del fetch', async () => {
  for (const filtros of [
    { fechaDesde: '2025-02-29' }, { fechaHasta: '2026-04-31' }, { fechaDesde: '0000-01-01' },
    { fechaDesde: '2026-11-02', fechaHasta: '2026-11-01' }, { fechaDesde: '2026-11-01T00:00:00Z' },
    { producto: 'x'.repeat(151) }, { page: 1 }, { limit: 10 }, { estado: 'FINALIZADA' },
  ]) await assert.rejects(servicio.consultarReporteProduccion(filtros));
  assert.equal(llamadas.length, 0);
  await montar();
  await cambiar('reporte-desde', '2026-11-10');
  await cambiar('reporte-hasta', '2026-11-01');
  const antes = llamadas.length;
  await aplicar();
  assert.equal(llamadas.length, antes);
  assert.match(texto(), /no puede ser posterior/);
});
test('muestra todas las cantidades, fuente, cierre y materiales sin inventar nombres', async () => {
  await montar();
  const detalle = textoNodo(tabla('Detalle por orden de producción'));
  for (const valor of ['ORD-42', 'Pan histórico', 'kg', '02/11/2026', ...Object.values(cantidades),
    'Cierre v2', '9007199254740993', '9007199254740994', '3.1000', '4.0000', '0.0001']) assert.ok(detalle.includes(valor), valor);
  assert.match(texto(), /Las pérdidas y los reprocesos son acumulados actuales/);
  assert.match(texto(), /Lo recuperado no se suma a la producción ni a los conformes/);
});
test('usa totales del servidor y conserva grupos, identificadores y decimales grandes', async () => {
  await montar();
  assert.ok(texto().includes('7 órdenes'));
  const totales = tabla('Totales por producto y unidad devueltos por el servidor');
  assert.equal(totales.findByType('tbody').findAllByType('tr').length, 2);
  assert.match(textoNodo(totales), /19999999999\.9999/);
  assert.match(textoNodo(totales), /0\.0001/);
  const materiales = tabla('Consumos totales por material y unidad');
  assert.equal(materiales.findByType('tbody').findAllByType('tr').length, 2);
  assert.match(textoNodo(materiales), /9007199254740994/);
  assert.match(textoNodo(tabla('Pérdidas totales por material y unidad (actuales)')), /0\.0002/);
});
test('fechas de calendario no se desplazan y producto admite campos null', async () => {
  const datos = reporte();
  datos.ordenes[0].producto = { recetaId: 3, codigo: null, nombre: null, unidad: null };
  datos.ordenes[0].fuente = 'REGISTROS';
  datos.ordenes[0].cierre = null;
  responder = () => json(datos);
  await montar();
  assert.match(texto(), /02\/11\/2026/);
  assert.match(texto(), /Sin código/);
  assert.match(texto(), /Sin nombre/);
  assert.match(texto(), /Sin unidad/);
  assert.match(texto(), /Registros actuales/);
});
test('mantiene filtros efectivos, indica ediciones pendientes y no consulta al editar', async () => {
  responder = () => json({ ...reporte(), filtros: { ...vacio.filtros, producto: 'Producto efectivo' } });
  await montar();
  assert.match(texto(), /Producto efectivo/);
  await cambiar('reporte-producto', 'Nuevo');
  assert.equal(llamadas.length, 1);
  assert.match(texto(), /corresponde a filtros anteriores/);
  assert.match(texto(), /ORD-42/);
});
test('informa resultado vacio sin ocultar los totales devueltos', async () => {
  responder = () => json(vacio);
  await montar();
  assert.match(texto(), /No hay órdenes que cumplan/);
  assert.match(texto(), /0 órdenes/);
  assert.match(texto(), /Sin totales de producto/);
});
test('reintenta la consulta aplicada, conserva el reporte previo y no usa filtros en edicion', async () => {
  await montar();
  await cambiar('reporte-producto', 'Aplicado');
  responder = () => json({ message: 'Servicio temporalmente no disponible' }, 503);
  await aplicar();
  assert.match(texto(), /Servicio temporalmente no disponible/);
  assert.match(texto(), /ORD-42/);
  await cambiar('reporte-producto', 'Sin aplicar');
  responder = (params) => json(reporte(params.get('producto')));
  await act(async () => boton('Reintentar').props.onClick());
  assert.deepEqual(ultima(), { producto: 'Aplicado' });
  assert.match(texto(), /corresponde a filtros anteriores/);
  assert.equal(root.root.findByProps({ id: 'reporte-producto' }).props.value, 'Sin aplicar');
});
test('informa sesion expirada y ofrece volver a ingresar', async () => {
  responder = () => json({}, 401);
  await montar();
  assert.match(texto(), /Tu sesión expiró/);
  assert.ok(root.root.findAll((node) => node.props.to === '/login').length);
});
test('descarta el reporte previo tras un 403 incluso al reintentar', async () => {
  await montar();
  responder = () => json({}, 403);
  await aplicar();
  assert.match(texto(), /No tienes permiso/);
  assert.doesNotMatch(texto(), /ORD-42/);
  let resolver;
  responder = () => new Promise((resolve) => { resolver = resolve; });
  await act(async () => { void boton('Reintentar').props.onClick(); });
  assert.match(texto(), /Cargando reporte/);
  assert.doesNotMatch(texto(), /ORD-42/);
  await act(async () => resolver(json({}, 503)));
  assert.doesNotMatch(texto(), /ORD-42/);
});
test('sin permiso local no consulta; ruta y menu aplican ordenes.consultar', async () => {
  globalThis.__usuarioReporte = { id: '9', permisos: [] };
  await montar();
  assert.equal(llamadas.length, 0);
  assert.match(texto(), /No tienes permiso/);
  await act(async () => root.unmount()); root = null;
  await montar(Rutas, '/produccion/reportes');
  assert.equal(llamadas.length, 0);
  assert.match(texto(), /Acceso denegado/);
  assert.equal(root.root.findAll((node) => node.props.to === '/produccion/reportes').length, 0);
});
test('registra ruta y enlace de menu para usuarios autorizados', async () => {
  await montar(Rutas, '/produccion/reportes');
  assert.equal(llamadas[0].url.pathname, '/api/produccion/reportes/produccion');
  assert.ok(root.root.findAll((node) => node.props.to === '/produccion/reportes').length);
  assert.match(texto(), /Reportes de producción/);
});
test('no permite que respuestas antiguas sobrescriban consultas mas recientes', async () => {
  const pendientes = [];
  responder = () => new Promise((resolve) => pendientes.push(resolve));
  await montar();
  assert.match(texto(), /Cargando reporte/);
  await cambiar('reporte-producto', 'Reciente');
  await aplicar();
  assert.equal(llamadas[0].options.signal.aborted, true);
  await act(async () => pendientes[1](json(reporte('Reciente'))));
  await act(async () => pendientes[0](json(reporte('Antiguo'))));
  assert.match(texto(), /Reciente/);
  assert.doesNotMatch(texto(), /Antiguo/);
});
test('ignora errores tardios y cancela al desmontar', async () => {
  const pendientes = [];
  responder = () => new Promise((resolve) => pendientes.push(resolve));
  await montar();
  await cambiar('reporte-producto', 'Actual');
  await aplicar();
  await act(async () => pendientes[1](json(reporte('Actual'))));
  await act(async () => pendientes[0](json({}, 401)));
  assert.doesNotMatch(texto(), /Tu sesión expiró/);
  await act(async () => root.unmount()); root = null;
  assert.equal(llamadas[1].options.signal.aborted, true);
});
test('informa fallo de red y contrato invalido sin transformar datos', async () => {
  responder = () => { throw new Error('Sin conexión'); };
  await montar();
  assert.match(texto(), /Sin conexión/);
  responder = () => json({ items: [] });
  await act(async () => boton('Reintentar').props.onClick());
  assert.match(texto(), /formato inválido/);
});
