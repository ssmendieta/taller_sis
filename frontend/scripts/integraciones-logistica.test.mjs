import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

// ABC-388: la consulta de Logística está separada de la de Producción.
let vite, Pagina, root, llamadas, respuestas;
const originales = Object.fromEntries(['fetch', 'document', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const evento = (cambios = {}) => ({
  id: '7', eventId: 'ev-7', correlationId: 'co-7', eventType: 'DespachoRutaRegistrado.v1',
  agregado: { tipo: 'Ruta', id: '9' }, destinoConfigurado: 'taller-logistica-salida-local', publicadorHabilitado: true,
  estado: 'PENDIENTE', intentos: 2, ultimoError: 'UNAVAILABLE: Pub/Sub no responde', creadoEn: '2026-11-10T12:00:00Z',
  proximoIntentoEn: '2026-11-10T12:05:00Z', publicadoEn: null, messageId: null, puedeReintentar: true, ...cambios,
});

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' } });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/IntegracionesPage.jsx'));
});
beforeEach(() => {
  llamadas = [];
  respuestas = {
    produccion: () => json({ items: [evento({ id: '1', eventId: 'ev-prod', eventType: 'ProduccionCerrada.v1', agregado: undefined })], total: 1, limit: 20 }),
    logistica: () => json({ items: [evento()], total: 1, limit: 20 }),
    reintentar: () => json({ mensaje: 'Reintento programado', evento: evento() }, 202),
  };
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    llamadas.push({ path: u.pathname, method: opts.method || 'GET' });
    if (u.pathname.endsWith('/reintentar')) return respuestas.reintentar();
    return u.pathname.startsWith('/api/logistica') ? respuestas.logistica() : respuestas.produccion();
  };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); });

async function montar() {
  await act(async () => { root = Renderer.create(React.createElement(Pagina)); });
}
const texto = () => JSON.stringify(root.toJSON());
const boton = (etiqueta) => root.root.find((n) => n.type === 'button' && n.children.includes(etiqueta));

test('por defecto muestra Producción, como antes', async () => {
  await montar();
  assert.equal(llamadas[0].path, '/api/produccion/integraciones/eventos');
  assert.match(texto(), /ev-prod/);
  assert.equal(boton('Producción').props['aria-pressed'], true);
});

test('la pestaña Logística consulta su propio outbox y no mezcla eventos', async () => {
  await montar();
  await act(async () => boton('Logística').props.onClick());
  assert.equal(llamadas.at(-1).path, '/api/logistica/integraciones/eventos');
  const t = texto();
  assert.match(t, /DespachoRutaRegistrado\.v1/);
  assert.match(t, /Ruta #/);
  assert.match(t, /Pub\/Sub no responde/);
  assert.doesNotMatch(t, /ev-prod/);
  assert.match(t, /outbox de Logística/);
});

test('reintentar en Logística llama al endpoint de Logística y refresca la lista', async () => {
  await montar();
  await act(async () => boton('Logística').props.onClick());
  await act(async () => boton('Reintentar').props.onClick());
  const post = llamadas.find((l) => l.method === 'POST');
  assert.equal(post.path, '/api/logistica/integraciones/eventos/7/reintentar');
  assert.equal(llamadas.at(-1).path, '/api/logistica/integraciones/eventos');
  assert.match(texto(), /Reintento programado para el evento ev-7/);
});

test('un 409 al reintentar se informa como error, no como éxito', async () => {
  respuestas.reintentar = () => json({ message: 'El evento ya fue publicado o está siendo procesado' }, 409);
  await montar();
  await act(async () => boton('Logística').props.onClick());
  await act(async () => boton('Reintentar').props.onClick());
  assert.match(texto(), /ya fue publicado o está siendo procesado/);
  assert.doesNotMatch(texto(), /Reintento programado para/);
});

test('sin permiso informa el 403', async () => {
  respuestas.logistica = () => json({ message: 'No tiene permisos para esta operación' }, 403);
  await montar();
  await act(async () => boton('Logística').props.onClick());
  assert.match(texto(), /No tienes permiso para administrar las publicaciones de integración/);
});
