import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

// ABC-323: formulario y listado de observaciones en el detalle de la orden.
let vite, Componente, root, llamadas, lista, respuestaPost;
const originales = Object.fromEntries(['fetch', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const obs = (id, cambios = {}) => ({
  id: String(id), ordenId: '7', tipo: 'OBSERVACION', descripcion: `Nota ${id}`,
  autorUsuarioId: '3', autorNombre: 'Paula Producción', fechaHora: '2026-11-03T15:00:00Z', ...cambios,
});

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' } });
  ({ default: Componente } = await vite.ssrLoadModule('/src/components/ordenes/ObservacionesOrden.jsx'));
});
beforeEach(() => {
  llamadas = [];
  lista = async () => json([obs(2, { tipo: 'INCIDENCIA', descripcion: 'Corte de luz' }), obs(1)]);
  respuestaPost = async (body) => json(obs(3, body), 201);
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    llamadas.push({ path, method: opts.method || 'GET', body, auth: opts.headers?.Authorization });
    if ((opts.method || 'GET') === 'POST') return respuestaPost(body);
    return lista();
  };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); });

async function montar(props = {}) {
  await act(async () => {
    root = Renderer.create(React.createElement(Componente, { ordenId: 7, puedeRegistrar: true, ...props }));
  });
}
const texto = () => JSON.stringify(root.toJSON());
const textoDe = (nodo) => typeof nodo === 'string' ? nodo : nodo.children.map(textoDe).join(' ');
const boton = () => root.root.find((n) => n.type === 'button' && n.props.type === 'submit');
async function escribir(valor) {
  const area = root.root.findByProps({ id: 'observacion-descripcion' });
  await act(async () => area.props.onChange({ target: { value: valor } }));
}
async function enviar() {
  const form = root.root.findByType('form');
  await act(async () => form.props.onSubmit({ preventDefault() {} }));
}

test('consulta la orden por el gateway con el token y muestra la lista en el orden recibido', async () => {
  await montar();
  assert.equal(llamadas[0].path, '/api/produccion/observaciones/orden/7');
  assert.equal(llamadas[0].auth, 'Bearer token-prueba');
  const filas = root.root.findAllByType('tr').slice(1);
  assert.equal(filas.length, 2);
  assert.match(textoDe(filas[0]), /Incidencia/);
  assert.match(textoDe(filas[0]), /Corte de luz/);
  assert.match(texto(), /Paula Producción/);
});

test('sin registros muestra el estado vacío', async () => {
  lista = async () => json([]);
  await montar();
  assert.match(texto(), /Sin observaciones ni incidencias registradas/);
});

test('un error de carga se informa y permite reintentar', async () => {
  lista = async () => json({ message: 'Orden con id 7 no encontrada' }, 404);
  await montar();
  assert.match(texto(), /Orden con id 7 no encontrada/);
  lista = async () => json([obs(1)]);
  const reintentar = root.root.find((n) => n.type === 'button' && n.children.includes('Reintentar'));
  await act(async () => reintentar.props.onClick());
  assert.match(texto(), /Nota 1/);
});

test('registra tipo y descripción recortada y agrega el nuevo registro al inicio', async () => {
  await montar();
  const select = root.root.findByProps({ id: 'observacion-tipo' });
  await act(async () => select.props.onChange({ target: { value: 'INCIDENCIA' } }));
  await escribir('  Falla del horno  ');
  await enviar();
  const post = llamadas.find((l) => l.method === 'POST');
  assert.deepEqual(post.body, { ordenId: 7, tipo: 'INCIDENCIA', descripcion: 'Falla del horno' });
  assert.equal(post.path, '/api/produccion/observaciones');
  const filas = root.root.findAllByType('tr').slice(1);
  assert.equal(filas.length, 3);
  assert.match(textoDe(filas[0]), /Falla del horno/);
  assert.match(texto(), /Incidencia registrada/);
  assert.equal(root.root.findByProps({ id: 'observacion-descripcion' }).props.value, '');
});

test('descripción vacía no se envía y el botón queda deshabilitado', async () => {
  await montar();
  await escribir('   ');
  assert.equal(boton().props.disabled, true);
  await enviar();
  assert.equal(llamadas.filter((l) => l.method === 'POST').length, 0);
  assert.match(texto(), /La descripción es obligatoria/);
});

test('doble envío mientras el POST espera manda una sola observación', async () => {
  let liberar;
  respuestaPost = (body) => new Promise((ok) => { liberar = () => ok(json(obs(3, body), 201)); });
  await montar();
  await escribir('Nota rápida');
  const form = root.root.findByType('form');
  await act(async () => {
    form.props.onSubmit({ preventDefault() {} });
    form.props.onSubmit({ preventDefault() {} });
  });
  assert.equal(llamadas.filter((l) => l.method === 'POST').length, 1);
  await act(async () => liberar());
});

test('muestra el error del servidor sin agregar el registro', async () => {
  respuestaPost = async () => json({ message: 'No tiene permisos para esta operación' }, 403);
  await montar();
  await escribir('Intento');
  await enviar();
  assert.match(texto(), /No tiene permisos para esta operación/);
  assert.equal(root.root.findAllByType('tr').length - 1, 2);
});

test('sin permiso de registro oculta el formulario pero muestra la lista', async () => {
  await montar({ puedeRegistrar: false });
  assert.equal(root.root.findAllByType('form').length, 0);
  assert.match(texto(), /No tienes permiso para registrar observaciones/);
  assert.match(texto(), /Corte de luz/);
});
