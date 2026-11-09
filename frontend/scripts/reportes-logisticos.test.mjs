import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// Sesión y HTTP simulados. Se montan la ruta, el formulario y el servicio reales.
const globales = ['document', 'sessionStorage', 'localStorage', 'fetch', '__sesionReporteLogistico'];
const originales = globales.map((clave) => [clave, Object.getOwnPropertyDescriptor(globalThis, clave)]);
let vite, Rutas, servicio, raiz, llamadas, responder;

function reporte(parametros, vacio = false) {
  return {
    filtros: { fechaDesde: parametros.get('fechaDesde'), fechaHasta: parametros.get('fechaHasta'),
      estadoRuta: parametros.get('estadoRuta'), estadoBoleta: parametros.get('estadoBoleta') },
    generadoEn: '2026-11-10T01:00:00Z', avisos: vacio ? [] : ['Una unidad no pudo consultarse.'],
    rutas: vacio ? [] : [{ id: '8', fechaProgramada: '2026-11-09', estado: 'COMPLETADA',
      vehiculoExternoId: 'VEH-1', choferExternoId: 'CHO-1', paradas: { total: 1, entregadas: 1, pendientes: 0, anuladas: 0 },
      boletas: { total: 2, emitidas: 1, anuladas: 1, entregadas: 1 }, incidencias: 2, reprogramaciones: 1 }],
    boletas: vacio ? [] : [
      { id: '1', numero: 'BE-EMITIDA', estado: 'EMITIDA', fecha: '2026-11-09', ordenId: '9', items: 3,
        cantidadTotal: '1234567890.1234', unidad: 'kg', rutaId: '8', estadoRuta: 'COMPLETADA', entregada: true },
      { id: '2', numero: 'BE-ANULADA', estado: 'ANULADA', fecha: '2026-11-09', ordenId: '9', items: 1,
        cantidadTotal: '2.1250', unidad: null, rutaId: '8', estadoRuta: 'COMPLETADA', entregada: false },
    ],
    resumen: { rutas: { total: vacio ? 0 : 1, porEstado: { COMPLETADA: vacio ? 0 : 1 } },
      entregas: { paradas: 1, entregadas: 1, pendientes: 0, anuladas: 0, boletasEntregadas: 1 },
      incidencias: { total: 2, porTipo: { RETRASO: 2 } }, reprogramaciones: 1,
      boletas: { total: vacio ? 0 : 2, porEstado: { EMITIDA: 1, ANULADA: 1 }, entregadas: 1,
        cantidadEmitidaPorUnidad: { kg: '1234567890.1234', l: '0.0100' } } },
  };
}

const json = (datos, status = 200) => Response.json(datos, { status });

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-reporte-logistico-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
        return 'export function useSesion(){return {usuario:globalThis.__sesionReporteLogistico, salir(){}};}';
      }
    } }] });
  ({ default: Rutas } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
  servicio = await vite.ssrLoadModule('/src/services/reportesLogisticosService.js');
});

beforeEach(() => {
  llamadas = [];
  responder = (parametros) => json(reporte(parametros));
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (clave) => clave === 'accessToken' ? 'token-logistico-prueba' : null };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__sesionReporteLogistico = { id: 7, permisos: [{ codigo: 'logistica.rutas.consultar' }] };
  globalThis.fetch = async (url, opciones) => {
    const destino = new URL(url);
    llamadas.push({ destino, opciones });
    return responder(destino.searchParams);
  };
});

afterEach(async () => { if (raiz) await act(async () => raiz.unmount()); raiz = null; });
after(async () => {
  await vite?.close();
  for (const [clave, descriptor] of originales) {
    if (descriptor) Object.defineProperty(globalThis, clave, descriptor);
    else delete globalThis[clave];
  }
});

async function montar() {
  await act(async () => {
    raiz = Renderer.create(React.createElement(MemoryRouter, { initialEntries: ['/logistica/reportes'] }, React.createElement(Rutas)));
  });
}
const textoNodo = (nodo) => typeof nodo === 'string' ? nodo : (nodo?.children ?? []).map(textoNodo).join('');
const texto = () => textoNodo(raiz.toJSON());
const parametros = () => Object.fromEntries(llamadas.at(-1).destino.searchParams);
const boton = (etiqueta) => raiz.root.find((nodo) => nodo.type === 'button' && nodo.children.includes(etiqueta));
const cambiar = (campo, value) => act(async () => raiz.root.findByProps({ id: `reporte-logistico-${campo}` }).props.onChange({ target: { value } }));
const consultar = () => act(async () => raiz.root.findByType('form').props.onSubmit({ preventDefault() {} }));

async function llenarPeriodo() {
  await cambiar('desde', '2026-11-01');
  await cambiar('hasta', '2026-11-30');
}

test('exige un período antes de llamar al gateway y valida fechas calendario', async () => {
  await montar();
  await consultar();
  assert.match(texto(), /Ingresa ambas fechas/);
  await cambiar('desde', '2026-02-30');
  await cambiar('hasta', '2026-03-01');
  await consultar();
  assert.match(texto(), /valores válidos/);
  assert.equal(llamadas.length, 0);
  assert.throws(() => servicio.parametrosReporteLogistico({ fechaDesde: '2026-02-01', fechaHasta: '2026-01-01' }), /posterior/);
  assert.throws(() => servicio.parametrosReporteLogistico({ fechaDesde: '2026-01-01', fechaHasta: '2027-01-02' }), /366/);
  assert.doesNotThrow(() => servicio.parametrosReporteLogistico({ fechaDesde: '2028-01-01', fechaHasta: '2028-12-31' }));
});

test('ruta y menú autorizados, consulta con Bearer y estados independientes', async () => {
  await montar();
  assert.ok(raiz.root.findAllByProps({ to: '/logistica/reportes' }).length);
  await llenarPeriodo();
  await cambiar('ruta', 'COMPLETADA');
  await cambiar('boleta', 'ANULADA');
  await consultar();
  assert.equal(llamadas[0].destino.pathname, '/api/logistica/reportes/logistica');
  assert.equal(llamadas[0].opciones.headers.Authorization, 'Bearer token-logistico-prueba');
  assert.deepEqual(parametros(), { fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estadoRuta: 'COMPLETADA', estadoBoleta: 'ANULADA' });
  assert.match(texto(), /Rutas: Completada\. Boletas: Anulada/);
});

test('distingue boletas anuladas y emitidas y conserva decimales y unidades', async () => {
  await montar();
  await llenarPeriodo();
  await consultar();
  const celdas = raiz.root.findAllByType('table')[1].findAllByType('tbody')[0].findAllByType('tr');
  assert.equal(celdas[0].findAllByType('td').at(-1).children.join(''), 'Sí');
  assert.equal(celdas[1].findAllByType('td').at(-1).children.join(''), 'No');
  assert.match(texto(), /Emitida: 1 · Anulada: 1/);
  assert.match(texto(), /1234567890\.1234 kg/);
  assert.match(texto(), /0\.0100 l/);
  assert.match(texto(), /Desconocida/);
  assert.match(texto(), /Una unidad no pudo consultarse/);
});

test('editar conserva el período mostrado y reintentar usa los filtros del intento fallido', async () => {
  await montar();
  await llenarPeriodo();
  await consultar();
  await cambiar('ruta', 'CANCELADA');
  assert.equal(llamadas.length, 1);
  assert.match(texto(), /filtros aplicados anteriormente/);
  responder = () => json({ message: 'Servicio no disponible' }, 503);
  await consultar();
  assert.match(texto(), /Servicio no disponible/);
  assert.match(texto(), /BE-EMITIDA/);
  await cambiar('ruta', 'DESPACHADA');
  responder = (filtros) => json(reporte(filtros, true));
  await act(async () => boton('Reintentar').props.onClick());
  assert.equal(parametros().estadoRuta, 'CANCELADA');
  assert.match(texto(), /No hay rutas ni boletas/);
  assert.doesNotMatch(texto(), /BE-EMITIDA/);
});

test('rechaza una respuesta con filtros distintos a los enviados', async () => {
  await montar();
  await llenarPeriodo();
  responder = (filtros) => json({ ...reporte(filtros), filtros: { fechaDesde: '2026-01-01' } });
  await consultar();
  assert.match(texto(), /filtros distintos/);
  assert.doesNotMatch(texto(), /Vista previa/);
});

test('limpiar cancela la consulta y una respuesta antigua no reaparece', async () => {
  await montar();
  await llenarPeriodo();
  let resolver;
  responder = (filtros) => new Promise((resolve) => { resolver = () => resolve(json(reporte(filtros))); });
  await consultar();
  assert.match(texto(), /Consultando reporte/);
  await act(async () => boton('Limpiar filtros').props.onClick());
  assert.ok(llamadas[0].opciones.signal.aborted);
  await act(async () => resolver());
  assert.match(texto(), /Elige un período/);
  assert.doesNotMatch(texto(), /Vista previa|Consultando reporte/);
});

test('403 descarta el reporte y el reintento fallido no recupera datos de la sesión anterior', async () => {
  await montar();
  await llenarPeriodo();
  await consultar();
  responder = () => json({}, 403);
  await consultar();
  assert.match(texto(), /No tienes permiso/);
  assert.doesNotMatch(texto(), /BE-EMITIDA/);
  responder = () => json({}, 503);
  await act(async () => boton('Reintentar').props.onClick());
  assert.doesNotMatch(texto(), /BE-EMITIDA/);
});

test('401 permite volver al login', async () => {
  await montar();
  await llenarPeriodo();
  responder = () => json({}, 401);
  await consultar();
  assert.match(texto(), /Tu sesión expiró/);
  assert.ok(raiz.root.findAllByProps({ to: '/login' }).length);
});

test('sin el permiso de rutas no muestra el menú ni consulta el reporte', async () => {
  globalThis.__sesionReporteLogistico.permisos = ['logistica.boletas.consultar'];
  await montar();
  assert.match(texto(), /Acceso denegado|No tienes permiso/);
  assert.equal(raiz.root.findAllByProps({ to: '/logistica/reportes' }).length, 0);
  assert.equal(llamadas.length, 0);
});

test('PDF y Excel usan el período y estados de la vista, aunque se edite el formulario', async () => {
  const archivos = [];
  globalThis.document.body = { append() {} };
  globalThis.document.createElement = () => ({ click() { archivos.push(this.download); }, remove() {} });
  await montar();
  assert.equal(raiz.root.findAllByProps({ 'aria-label': 'Descargar vista previa' }).length, 0);
  await llenarPeriodo();
  await cambiar('ruta', 'COMPLETADA');
  await cambiar('boleta', 'ANULADA');
  await consultar();
  const consulta = parametros();
  await cambiar('desde', '2026-11-15');
  await cambiar('boleta', 'EMITIDA');
  for (const [formato, etiqueta, tipo] of [
    ['pdf', 'PDF', 'application/pdf'], ['xlsx', 'Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ]) {
    responder = () => new Response('archivo-de-prueba', { headers: { 'Content-Type': tipo } });
    await act(async () => boton(`Descargar ${etiqueta}`).props.onClick());
    assert.equal(llamadas.at(-1).destino.pathname, `/api/logistica/reportes/logistica/exportar/${formato}`);
    assert.equal(llamadas.at(-1).opciones.headers.Authorization, 'Bearer token-logistico-prueba');
    assert.deepEqual(parametros(), consulta);
    assert.equal(archivos.at(-1), `reporte-logistico_2026-11-01_a_2026-11-30.${formato}`);
  }
  assert.equal(archivos.length, 2);
});

test('una descarga con tipo inválido informa el fallo y conserva la vista', async () => {
  await montar();
  await llenarPeriodo();
  await consultar();
  responder = () => new Response('<html>Error</html>', { headers: { 'Content-Type': 'text/html' } });
  await act(async () => boton('Descargar PDF').props.onClick());
  assert.match(texto(), /archivo válido/);
  assert.match(texto(), /BE-EMITIDA/);
});

test('un 403 al descargar elimina la vista previa y sus botones', async () => {
  await montar();
  await llenarPeriodo();
  await consultar();
  responder = () => json({}, 403);
  await act(async () => boton('Descargar Excel').props.onClick());
  assert.match(texto(), /No tienes permiso para descargar/);
  assert.doesNotMatch(texto(), /BE-EMITIDA|Descargar PDF/);
});
