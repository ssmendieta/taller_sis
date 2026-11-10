import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

// PRUEBA SIMULADA (ABC-363): monta el componente React real. Solo la API se
// sustituye por respuestas en memoria para verificar permisos, flujo y errores.
let vite, Componente, root, llamadas, grupos, conflicto;
const originales = Object.fromEntries(['fetch', 'sessionStorage', 'localStorage'].map((clave) => [clave, globalThis[clave]]));
const solicitudes = [
  { id: '1', estado: 'PREPARADA', destinoDocumental: 'Zona Sur' },
  { id: '2', estado: 'BORRADOR', destinoDocumental: 'Zona Sur' },
  { id: '3', estado: 'PREPARADA', destinoDocumental: 'Zona Norte' },
];
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

before(async () => {
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' },
  });
  ({ default: Componente } = await vite.ssrLoadModule('/src/components/logistica/AgrupacionSolicitudes.jsx'));
});

beforeEach(() => {
  llamadas = [];
  conflicto = false;
  grupos = [
    { id: '9', destino: 'Zona Centro', fechaRequerida: '2026-11-12', tipoCarga: 'Seca', unidadCarga: 'kg', solicitudIds: ['7', '8'], despachado: false },
    { id: '10', destino: 'Zona Norte', fechaRequerida: '2026-11-12', tipoCarga: 'Fría', unidadCarga: 'kg', solicitudIds: ['10', '11'], despachado: true },
  ];
  globalThis.sessionStorage = { getItem: (clave) => (clave === 'accessToken' ? 'token-abc363' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, opciones = {}) => {
    const ruta = new URL(url).pathname;
    const metodo = opciones.method || 'GET';
    const body = opciones.body ? JSON.parse(opciones.body) : null;
    llamadas.push({ ruta, metodo, body, authorization: opciones.headers?.Authorization });
    if (metodo === 'GET' && ruta.endsWith('/agrupaciones')) return json(grupos);
    if (metodo === 'POST' && ruta.endsWith('/agrupaciones')) {
      if (conflicto) return json({
        message: 'Las solicitudes no son compatibles para agrupar',
        conflictos: [{ solicitudId: '3', motivo: 'DESTINO_DISTINTO' }],
      }, 409);
      const creado = {
        id: '11', destino: 'Zona Sur', fechaRequerida: body.solicitudes[0].fechaRequerida,
        tipoCarga: body.solicitudes[0].tipoCarga, unidadCarga: 'kg',
        solicitudIds: body.solicitudes.map(({ solicitudId }) => solicitudId), despachado: false,
      };
      grupos = [creado, ...grupos];
      return json(creado, 201);
    }
    const deshacer = /\/agrupaciones\/(\d+)\/deshacer$/.exec(ruta);
    if (metodo === 'POST' && deshacer) {
      grupos = grupos.filter(({ id }) => id !== deshacer[1]);
      return json({ id: deshacer[1], deshechoEn: '2026-11-10T20:00:00.000Z' });
    }
    throw new Error(`Petición inesperada: ${metodo} ${ruta}`);
  };
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});
after(async () => {
  await vite?.close();
  Object.assign(globalThis, originales);
});

function textoDe(nodo) {
  if (nodo == null) return '';
  if (typeof nodo === 'string') return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join('');
  return textoDe(nodo.children);
}
const texto = () => textoDe(root.toJSON());
const botones = (etiqueta) => root.root.findAll((nodo) => nodo.type === 'button' && textoDe(nodo.children) === etiqueta);

async function montar(permisos = { puedeAgrupar: true, puedeDeshacer: true }) {
  await act(async () => {
    root = Renderer.create(React.createElement(Componente, { solicitudes, ...permisos }));
    await new Promise((resolver) => setImmediate(resolver));
  });
}

async function seleccionar(ids) {
  for (const id of ids) {
    const casilla = root.root.findAll((nodo) => nodo.type === 'input' && nodo.props.type === 'checkbox')
      .find((nodo) => textoDe(nodo.parent?.children).includes(`Solicitud #${id}`));
    await act(async () => casilla.props.onChange());
  }
}

async function completar(fecha, tipo) {
  for (const campo of root.root.findAll((nodo) => nodo.type === 'input' && nodo.props.type === 'date')) {
    await act(async () => campo.props.onChange({ target: { value: fecha } }));
  }
  for (const campo of root.root.findAll((nodo) => nodo.type === 'input' && nodo.props.type === 'text')) {
    await act(async () => campo.props.onChange({ target: { value: tipo } }));
  }
}

test('agrupa dos solicitudes desde la interfaz y envía autorización y contrato esperado', async () => {
  await montar();
  await seleccionar(['1', '2']);
  await completar('2026-11-12', 'Seca');
  const formulario = root.root.findByType('form');
  await act(async () => formulario.props.onSubmit({ preventDefault() {} }));

  const post = llamadas.find(({ metodo, ruta }) => metodo === 'POST' && ruta.endsWith('/agrupaciones'));
  assert.deepEqual(post.body, { solicitudes: [
    { solicitudId: '1', fechaRequerida: '2026-11-12', tipoCarga: 'Seca' },
    { solicitudId: '2', fechaRequerida: '2026-11-12', tipoCarga: 'Seca' },
  ] });
  assert.equal(post.authorization, 'Bearer token-abc363');
  assert.match(texto(), /Grupo #11 creado/);
  assert.match(texto(), /Solicitudes 1, 2/);
});

test('muestra el conflicto de compatibilidad identificado por solicitud', async () => {
  conflicto = true;
  await montar();
  await seleccionar(['1', '3']);
  await completar('2026-11-12', 'Seca');
  await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.match(texto(), /Las solicitudes no son compatibles para agrupar/);
  assert.match(texto(), /Solicitud #3: destino distinto/);
});

test('deshace un grupo activo y nunca ofrece deshacer el grupo despachado', async () => {
  await montar();
  assert.equal(botones('Deshacer grupo #9').length, 1);
  assert.equal(botones('Deshacer grupo #10').length, 0);
  await act(async () => botones('Deshacer grupo #9')[0].props.onClick());
  assert.match(texto(), /Grupo #9 deshecho/);
  assert.doesNotMatch(texto(), /Grupo #9 ·/);
  assert.equal(llamadas.some(({ metodo, ruta }) => metodo === 'POST' && ruta.endsWith('/agrupaciones/9/deshacer')), true);
});

test('con permiso de consulta solamente no permite agrupar ni deshacer', async () => {
  await montar({ puedeAgrupar: false, puedeDeshacer: false });
  assert.equal(root.root.findAllByType('form').length, 0);
  assert.equal(root.root.findAllByType('button').length, 0);
  assert.match(texto(), /Grupo #9/);
  assert.match(texto(), /Despachado/);
});
