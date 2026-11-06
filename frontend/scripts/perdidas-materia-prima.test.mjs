import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

// Prueba simulada: la API de Producción se reemplaza por un fetch en memoria con
// las reglas de ABC-315. El componente y su servicio se cargan sin modificar.
const materiales = [
  { id: 1, codigo: 'HAR-001', nombre: 'Harina', unidad: 'kg' },
  { id: 2, codigo: 'LEC-001', nombre: 'Leche', unidad: 'l' },
];
const respuesta = (datos, status = 200) => new Response(JSON.stringify(datos), { status,
  headers: { 'Content-Type': 'application/json' } });
const fetchOriginal = globalThis.fetch;
const sessionOriginal = globalThis.sessionStorage;
const localOriginal = globalThis.localStorage;
let vite, PerdidasMateriaPrima, servicio;
let root, llamadas, perdidas, postPendiente, respuestaPost, respuestaGet;

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' } });
  ({ default: PerdidasMateriaPrima } = await vite.ssrLoadModule('/src/components/ordenes/PerdidasMateriaPrima.jsx'));
  servicio = await vite.ssrLoadModule('/src/services/perdidasMateriaPrimaService.js');
});

beforeEach(() => {
  globalThis.sessionStorage = { getItem: (clave) => clave === 'accessToken' ? 'token-prueba' : null };
  globalThis.localStorage = { getItem: () => null };
  llamadas = [];
  perdidas = [{ id: '1', ordenId: '7', materialId: '2', cantidad: '0.5000', unidad: 'l', motivo: 'Vencida',
    autorUsuarioId: '43', fechaHora: '2026-11-05T13:00:00.000Z', material: materiales[1] }];
  postPendiente = null;
  respuestaPost = null;
  respuestaGet = null;
  globalThis.fetch = async (url, opciones = {}) => {
    const path = new URL(url).pathname;
    const method = opciones.method || 'GET';
    llamadas.push({ path, method, headers: opciones.headers, body: opciones.body ? JSON.parse(opciones.body) : undefined });
    if (path.endsWith('/perdidas-materia-prima/orden/7') && method === 'GET') {
      return respuestaGet ? respuestaGet() : respuesta(perdidas);
    }
    if (path.endsWith('/perdidas-materia-prima') && method === 'POST') {
      if (postPendiente) await postPendiente;
      if (respuestaPost) return respuestaPost();
      const datos = JSON.parse(opciones.body);
      const guardada = { ...datos, id: String(perdidas.length + 1), ordenId: '7', materialId: String(datos.materialId),
        cantidad: datos.cantidad.toFixed(4), autorUsuarioId: '42', fechaHora: '2026-11-05T14:00:00.000Z',
        material: materiales.find((m) => m.id === datos.materialId) };
      perdidas.push(guardada);
      return respuesta(guardada, 201);
    }
    throw new Error(`Petición inesperada: ${method} ${url}`);
  };
});

afterEach(async () => { if (root) await act(async () => { root.unmount(); }); root = null; });
after(async () => {
  await vite?.close();
  globalThis.fetch = fetchOriginal;
  for (const [clave, valor] of [['sessionStorage', sessionOriginal], ['localStorage', localOriginal]]) {
    if (valor === undefined) delete globalThis[clave]; else globalThis[clave] = valor;
  }
});

async function montar(props = {}) {
  await act(async () => {
    root = Renderer.create(React.createElement(PerdidasMateriaPrima, {
      ordenId: '7', materiales, permiteRegistrar: true, usuario: { id: 42, nombre_completo: 'Tatiana Prueba' }, ...props,
    }));
  });
}
const texto = () => JSON.stringify(root.toJSON());
async function cambiar(id, value) {
  await act(async () => { root.root.findByProps({ id }).props.onChange({ target: { value } }); });
}
async function completar(material = '1', cantidad = '2.125', motivo = '  Derrame en mezcladora  ') {
  await cambiar('perdida-material', material);
  await cambiar('perdida-cantidad', cantidad);
  await cambiar('perdida-motivo', motivo);
}
const formulario = () => root.root.findByType('form');
const posts = () => llamadas.filter((l) => l.method === 'POST');

test('servicio: envía Bearer y solo el contrato de ABC-315 (sin autor ni fecha)', async () => {
  await servicio.registrarPerdida({ ordenId: 7, materialId: 1, cantidad: 2, unidad: 'kg', motivo: 'Derrame',
    autorUsuarioId: 99, fechaHora: '2020-01-01' });
  assert.equal(llamadas[0].headers.Authorization, 'Bearer token-prueba');
  assert.deepEqual(llamadas[0].body, { ordenId: 7, materialId: 1, cantidad: 2, unidad: 'kg', motivo: 'Derrame' });
});

test('carga las pérdidas guardadas de la orden y no consulta calidad', async () => {
  await montar();
  assert.match(texto(), /Vencida/);
  assert.match(texto(), /Usuario 43/);
  assert.equal(llamadas.some((l) => l.path.includes('/calidad')), false);
});

test('estado vacío cuando la orden no tiene pérdidas', async () => {
  perdidas = [];
  await montar();
  assert.match(texto(), /Esta orden no tiene pérdidas registradas/);
});

test('una pérdida guardada aparece en la misma orden sin recargar la página', async () => {
  await montar();
  await completar();
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });

  assert.equal(posts().length, 1);
  assert.deepEqual(posts()[0].body, { ordenId: 7, materialId: 1, cantidad: 2.125, unidad: 'kg', motivo: 'Derrame en mezcladora' });
  const indicePost = llamadas.findIndex((l) => l.method === 'POST');
  assert.ok(llamadas.slice(indicePost + 1).some((l) => l.method === 'GET'), 'vuelve a pedir la lista a la API');
  assert.match(texto(), /Pérdida registrada/);
  assert.match(texto(), /Derrame en mezcladora/);
  assert.match(texto(), /Tatiana Prueba/);
  assert.equal(root.root.findByProps({ id: 'perdida-motivo' }).props.value, '');
});

test('no hace doble envío si se envía dos veces antes de que responda la API', async () => {
  let liberar;
  postPendiente = new Promise((resolver) => { liberar = resolver; });
  await montar();
  await completar();
  let primero;
  await act(async () => {
    primero = formulario().props.onSubmit({ preventDefault() {} });
    formulario().props.onSubmit({ preventDefault() {} });
  });
  assert.equal(posts().length, 1);
  await act(async () => { liberar(); await primero; });
  assert.equal(posts().length, 1);
});

test('muestra el error del backend y no agrega la pérdida', async () => {
  respuestaPost = () => respuesta({ statusCode: 400, message: 'La unidad del material debe ser kg' }, 400);
  await montar();
  await completar();
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });
  assert.match(texto(), /La unidad del material debe ser kg/);
  // El listado sigue con lo guardado; el formulario conserva lo escrito para corregirlo.
  const celdas = root.root.findByType('tbody').findAllByType('td').map((td) => td.children.join(''));
  assert.equal(celdas.includes('Derrame en mezcladora'), false);
  assert.equal(root.root.findByType('tbody').findAllByType('tr').length, 1);
  assert.equal(root.root.findByProps({ id: 'perdida-motivo' }).props.value, '  Derrame en mezcladora  ');
});

test('valida antes de enviar: sin motivo o con cantidad cero no llama a la API', async () => {
  await montar();
  await completar('1', '2', '   ');
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });
  assert.match(texto(), /Indica el motivo de la pérdida/);
  await completar('1', '0', 'Derrame');
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });
  assert.match(texto(), /mayor que cero/);
  assert.equal(posts().length, 0);
});

test('error al cargar: muestra el mensaje y permite reintentar', async () => {
  respuestaGet = () => respuesta({ message: 'No se pudo comprobar la sesión con Auth' }, 503);
  await montar();
  assert.match(texto(), /No se pudo comprobar la sesión con Auth/);
  respuestaGet = null;
  const reintentar = root.root.findAll((nodo) => nodo.type === 'button' && nodo.children.includes('Reintentar'))[0];
  await act(async () => { await reintentar.props.onClick(); });
  assert.match(texto(), /Vencida/);
});

test('sin permiso de registro solo muestra el listado', async () => {
  await montar({ permiteRegistrar: false });
  assert.equal(root.root.findAllByType('form').length, 0);
  assert.match(texto(), /No tienes permiso para registrar pérdidas/);
  assert.match(texto(), /Vencida/);
});
