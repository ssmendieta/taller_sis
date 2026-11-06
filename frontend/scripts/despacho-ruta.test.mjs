import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createServer } from 'vite';

// PRUEBA SIMULADA (ABC-377): la API de Logística es un fetch en memoria que aplica
// las reglas de ABC-376 (despacho, entrega por parada, 409 y cierre de la ruta).
// La página, sus componentes y el servicio se cargan sin modificar.
let vite, Pagina, root, llamadas, ruta, boletasAnuladas, retenerPost;
const originales = Object.fromEntries(['fetch', 'document', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const GESTION = ['logistica.rutas.consultar', 'logistica.rutas.gestionar', 'logistica.boletas.consultar'];

function rutaInicial(estado = 'PLANIFICADA') {
  const parada = (id, secuencia, destino, boletaIds) => ({
    id, rutaId: '9', secuencia, destino, estadoEntrega: 'PENDIENTE', entregaActualizadaEn: null, entregaUsuarioId: null,
    entregaObservacion: null, boletas: boletaIds.map((boletaId) => ({ id: `d${boletaId}`, paradaId: id, boletaId })),
  });
  return {
    id: '9', fechaProgramada: '2026-11-10', vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12', estado,
    despachadaEn: null, despachadaPorUsuarioId: null, despachoObservacion: null, completadaEn: null,
    paradas: [parada('10', 1, 'Tienda Central', ['1', '2']), parada('11', 2, 'Sucursal Norte', ['3'])],
  };
}

function api(path, metodo, cuerpo) {
  if (metodo === 'GET' && path === '/api/logistica/rutas/9') return json(ruta);
  if (metodo === 'POST' && path === '/api/logistica/rutas/9/despacho') {
    if (ruta.estado !== 'PLANIFICADA') return json({ message: `La ruta ya está en estado ${ruta.estado}` }, 409);
    if (boletasAnuladas.length) return json({ message: `Solo se despachan boletas EMITIDAS: ${boletasAnuladas.map((b) => `${b} (ANULADA)`).join(', ')}` }, 409);
    Object.assign(ruta, { estado: 'DESPACHADA', despachadaEn: '2026-11-10T12:30:00.000Z', despachadaPorUsuarioId: '42', despachoObservacion: cuerpo.observacion });
    return json(ruta, 201);
  }
  const entrega = /^\/api\/logistica\/rutas\/9\/paradas\/(\d+)\/entrega$/.exec(path);
  if (metodo === 'POST' && entrega) {
    const parada = ruta.paradas.find((p) => p.id === entrega[1]);
    if (ruta.estado !== 'DESPACHADA') return json({ message: `Solo se entrega en una ruta DESPACHADA (estado actual: ${ruta.estado})` }, 409);
    if (parada.estadoEntrega !== 'PENDIENTE') return json({ message: `La entrega ya está en estado ${parada.estadoEntrega}` }, 409);
    const anuladas = parada.boletas.map((b) => b.boletaId).filter((b) => boletasAnuladas.includes(b));
    if (anuladas.length) return json({ message: `No se pueden entregar boletas anuladas o no emitidas: ${anuladas.map((b) => `${b} (ANULADA)`).join(', ')}` }, 409);
    Object.assign(parada, { estadoEntrega: 'ENTREGADA', entregaActualizadaEn: '2026-11-10T15:05:00.000Z', entregaUsuarioId: '42', entregaObservacion: cuerpo.observacion });
    if (ruta.paradas.every((p) => p.estadoEntrega !== 'PENDIENTE')) Object.assign(ruta, { estado: 'COMPLETADA', completadaEn: '2026-11-10T15:05:00.000Z' });
    return json(ruta, 201);
  }
  throw new Error(`Petición inesperada: ${metodo} ${path}`);
}

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-despacho-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) return 'export function useSesion(){return {usuario: globalThis.__usuarioDespacho};}';
    } }] });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/RutaDetallePage.jsx'));
});

beforeEach(() => {
  llamadas = [];
  ruta = rutaInicial();
  boletasAnuladas = [];
  retenerPost = null;
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__usuarioDespacho = { id: '42', permisos: GESTION };
  globalThis.fetch = async (url, opciones = {}) => {
    const path = new URL(url).pathname;
    const metodo = opciones.method || 'GET';
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
    llamadas.push({ path, metodo, cuerpo, auth: opciones.headers?.Authorization });
    if (metodo === 'POST' && retenerPost) await retenerPost;
    return api(path, metodo, cuerpo);
  };
});

afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); delete globalThis.__usuarioDespacho; });

async function montar() {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, { initialEntries: ['/logistica/rutas/9'] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/logistica/rutas/:id', element: React.createElement(Pagina) }))));
  });
}

function textoDe(nodo) {
  if (nodo == null) return '';
  if (typeof nodo === 'string') return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join('');
  return textoDe(nodo.children);
}
const texto = () => textoDe(root.toJSON());
const botones = (etiqueta) => root.root.findAll((n) => n.type === 'button' && (textoDe(n.children) === etiqueta || n.props['aria-label'] === etiqueta));
const posts = () => llamadas.filter((l) => l.metodo === 'POST');
const evento = { preventDefault() {} };
const campo = (id) => root.root.find((n) => n.type === 'textarea' && n.props.id === id);

async function escribir(id, valor) {
  await act(async () => campo(id).props.onChange({ target: { value: valor } }));
}
async function enviarFormulario(idCampo) {
  const formulario = root.root.find((n) => n.type === 'form' && n.findAll((h) => h.props.id === idCampo).length > 0);
  await act(async () => { await formulario.props.onSubmit(evento); });
}
async function abrirEntrega(secuencia) {
  await act(async () => botones(`Registrar entrega de la parada ${secuencia}`)[0].props.onClick());
}
async function entregar(secuencia, paradaId, observacion = '') {
  await abrirEntrega(secuencia);
  if (observacion) await escribir(`entrega-observacion-${paradaId}`, observacion);
  await enviarFormulario(`entrega-observacion-${paradaId}`);
}

test('despacha una ruta PLANIFICADA con observación; fecha y autor los devuelve el servidor', async () => {
  await montar();
  assert.match(texto(), /Sin despachar/);
  assert.equal(botones('Registrar entrega de la parada 1').length, 0, 'sin despacho no se puede entregar');
  await escribir('despacho-observacion', '  Salida 8:30 con carga completa ');
  await enviarFormulario('despacho-observacion');

  assert.deepEqual(posts().map(({ path, cuerpo, auth }) => ({ path, cuerpo, auth })), [{
    path: '/api/logistica/rutas/9/despacho', cuerpo: { observacion: 'Salida 8:30 con carga completa' }, auth: 'Bearer token-prueba',
  }]);
  const pagina = texto();
  assert.match(pagina, /Ruta despachada: está en tránsito/);
  assert.match(pagina, /10\/11\/2026 08:30 · usuario #42 · en tránsito/);
  assert.match(pagina, /Salida 8:30 con carga completa/);
  assert.equal(botones('Despachar ruta').length, 0, 'el formulario de despacho desaparece');
  assert.equal(botones('Registrar entrega de la parada 1').length, 1);
  assert.equal(botones('Registrar entrega de la parada 2').length, 1);
});

test('sin observación envía null', async () => {
  await montar();
  await enviarFormulario('despacho-observacion');
  assert.deepEqual(posts()[0].cuerpo, { observacion: null });
});

test('un segundo envío mientras se despacha no repite la petición y el botón queda desactivado', async () => {
  let liberar;
  retenerPost = new Promise((resolver) => { liberar = resolver; });
  await montar();
  const formulario = root.root.find((n) => n.type === 'form');
  let primero;
  act(() => { primero = formulario.props.onSubmit(evento); formulario.props.onSubmit(evento); });
  assert.equal(botones('Despachando…')[0].props.disabled, true);
  assert.equal(campo('despacho-observacion').props.disabled, true);
  await act(async () => { liberar(); await primero; });
  assert.equal(posts().length, 1);
  assert.match(texto(), /Ruta despachada/);
});

test('409 por boleta anulada: muestra el motivo, recarga la ruta y permite corregir', async () => {
  boletasAnuladas = ['2'];
  await montar();
  await enviarFormulario('despacho-observacion');
  assert.match(texto(), /No se despachó la ruta: Solo se despachan boletas EMITIDAS: 2 \(ANULADA\)/);
  assert.equal(llamadas.filter((l) => l.metodo === 'GET').length, 2, 'vuelve a consultar el estado real');
  assert.equal(botones('Despachar ruta')[0].props.disabled, false, 'el botón vuelve a quedar disponible');
});

test('409 porque otro usuario ya despachó: muestra el motivo y el estado real', async () => {
  await montar();
  Object.assign(ruta, { estado: 'DESPACHADA', despachadaEn: '2026-11-10T12:00:00.000Z', despachadaPorUsuarioId: '7' });
  await enviarFormulario('despacho-observacion');
  const pagina = texto();
  assert.match(pagina, /La ruta ya está en estado DESPACHADA/);
  assert.match(pagina, /usuario #7/);
  assert.equal(botones('Despachar ruta').length, 0);
});

test('entrega individual: la primera parada deja la ruta en tránsito y la última la completa', async () => {
  ruta = rutaInicial('DESPACHADA');
  await montar();
  await entregar(1, '10', 'Recibió Ana Rojas');
  assert.equal(posts()[0].path, '/api/logistica/rutas/9/paradas/10/entrega');
  assert.deepEqual(posts()[0].cuerpo, { observacion: 'Recibió Ana Rojas' });
  let pagina = texto();
  assert.match(pagina, /Entrega de la parada 1 registrada\. La ruta sigue en tránsito\./);
  assert.match(pagina, /1 de 2 entregas registradas/);
  assert.match(pagina, /10\/11\/2026 11:05 · usuario #42/);
  assert.match(pagina, /“Recibió Ana Rojas”/);
  assert.equal(botones('Registrar entrega de la parada 1').length, 0, 'una parada entregada no se puede volver a entregar');
  assert.equal(botones('Registrar entrega de la parada 2').length, 1);

  await entregar(2, '11');
  pagina = texto();
  assert.match(pagina, /la ruta quedó completada/);
  assert.match(pagina, /2 de 2 entregas registradas/);
  assert.match(pagina, /Completada10\/11\/2026 11:05/);
  assert.equal(root.root.findAll((n) => n.type === 'button' && /Registrar entrega/.test(n.props['aria-label'] ?? '')).length, 0);
});

test('una parada con boleta anulada no se entrega: muestra el motivo y sigue pendiente', async () => {
  ruta = rutaInicial('DESPACHADA');
  boletasAnuladas = ['3'];
  await montar();
  await entregar(2, '11');
  assert.match(texto(), /Parada 2: No se pueden entregar boletas anuladas o no emitidas: 3 \(ANULADA\)/);
  assert.equal(ruta.paradas[1].estadoEntrega, 'PENDIENTE');
  assert.match(texto(), /0 de 2 entregas registradas/);
});

test('las paradas anuladas no cuentan como entregas pendientes', async () => {
  ruta = rutaInicial('DESPACHADA');
  Object.assign(ruta.paradas[1], { estadoEntrega: 'ANULADA', entregaActualizadaEn: '2026-11-10T13:00:00.000Z', entregaUsuarioId: '7' });
  await montar();
  assert.match(texto(), /0 de 1 entrega registradas · 1 anulada/);
  assert.equal(botones('Registrar entrega de la parada 2').length, 0);
});

test('cancelar cierra el formulario de entrega sin enviar nada', async () => {
  ruta = rutaInicial('DESPACHADA');
  await montar();
  await abrirEntrega(1);
  await act(async () => botones('Cancelar')[0].props.onClick());
  assert.equal(posts().length, 0);
  assert.equal(botones('Registrar entrega de la parada 1').length, 1);
});

test('con solo permiso de consulta (Supervisor) no hay acciones', async () => {
  globalThis.__usuarioDespacho = { id: '5', permisos: ['logistica.rutas.consultar'] };
  await montar();
  assert.equal(botones('Despachar ruta').length, 0);
  ruta = rutaInicial('DESPACHADA');
  await act(async () => root.unmount());
  await montar();
  assert.equal(root.root.findAll((n) => n.type === 'button').length, 0);
  assert.match(texto(), /Detalle de solo lectura/);
});

test('la notificación a Inventarios se muestra aparte del estado de entrega', async () => {
  ruta = rutaInicial('DESPACHADA');
  await montar();
  const panel = root.root.find((n) => n.props?.['aria-labelledby'] === 'ruta-inventarios-titulo');
  assert.match(textoDe(panel.children.map((h) => h)), /Notificación a Inventarios/);
  assert.match(texto(), /despachar o entregar no confirma movimientos de inventario/);
});
