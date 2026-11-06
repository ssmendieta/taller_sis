import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

// ABC-319 y ABC-320: Indicador de avance y detalle de registros por orden (ABC-105).
let vite, Componente, root, llamadas, respuestaGet, respuestaPost;
const originales = Object.fromEntries(['fetch', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

const mockResumen = (cambios = {}) => ({
  orden_id: 42,
  orden_codigo: 'OP-042',
  cantidad_solicitada: 100,
  cantidad_producida: 60,
  cantidad_pendiente: 40,
  porcentaje_avance: 60,
  registros: [
    {
      id: '2',
      orden_id: '42',
      cantidad_producida: 40,
      fecha_hora: '2026-11-06T11:00:00.000Z',
      usuario_responsable_id: '9',
      usuario_responsable_nombre: 'Operario A',
    },
    {
      id: '1',
      orden_id: '42',
      cantidad_producida: 20,
      fecha_hora: '2026-11-06T09:30:00.000Z',
      usuario_responsable_id: '3',
      usuario_responsable_nombre: 'Supervisor B',
    },
  ],
  ...cambios,
});

before(async () => {
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' },
  });
  ({ default: Componente } = await vite.ssrLoadModule('/src/components/ordenes/AvanceOrden.jsx'));
});

beforeEach(() => {
  llamadas = [];
  respuestaGet = async () => json(mockResumen());
  respuestaPost = async (body) => json({ id: '3', ...body }, 201);
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, opts = {}) => {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    llamadas.push({ path, method: opts.method || 'GET', body, auth: opts.headers?.Authorization });
    if ((opts.method || 'GET') === 'POST') {
      return respuestaPost(body);
    }
    return respuestaGet();
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

async function montar(props = {}) {
  await act(async () => {
    root = Renderer.create(
      React.createElement(Componente, {
        ordenId: 42,
        unidad: 'kg',
        enProduccion: true,
        permiteRegistrar: true,
        estadoOrden: 'EN_PRODUCCION',
        ...props,
      })
    );
  });
}

const texto = () => JSON.stringify(root.toJSON());

test('ABC-319 CA-01: consulta el resumen con token Bearer y muestra "60 de 100" y "60 %"', async () => {
  await montar();

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].path, '/api/produccion/avances/42/resumen');
  assert.equal(llamadas[0].auth, 'Bearer token-prueba');

  const contenido = texto();
  // Indicador de avance "60 de 100" y porcentaje "60%"
  assert.match(contenido, /60%/);
  assert.match(contenido, /60.*de.*100/);
  assert.match(contenido, /Pendiente.*40/);

  // Barra de progreso con atributos de accesibilidad
  const progressbar = root.root.findByProps({ role: 'progressbar' });
  assert.equal(progressbar.props['aria-valuenow'], 60);
  assert.equal(progressbar.props['aria-valuemin'], '0');
  assert.equal(progressbar.props['aria-valuemax'], '100');
});

test('ABC-319 CA-02: sin avances muestra 0 % y previene divisiones entre cero o NaN', async () => {
  respuestaGet = async () =>
    json(
      mockResumen({
        cantidad_solicitada: 0,
        cantidad_producida: 0,
        cantidad_pendiente: 0,
        porcentaje_avance: 0,
        registros: [],
      })
    );

  await montar();
  const contenido = texto();
  assert.doesNotMatch(contenido, /NaN/);
  assert.match(contenido, /0%/);
  assert.match(contenido, /Sin avances registrados \(0 %\)/);

  const progressbar = root.root.findByProps({ role: 'progressbar' });
  assert.equal(progressbar.props['aria-valuenow'], 0);
});

test('ABC-319 y ABC-320 CA-03: muestra detalle cronológico con cantidad, fecha, hora y usuario', async () => {
  await montar();

  const filas = root.root.findAllByType('tr').slice(1);
  assert.equal(filas.length, 2);

  const contenido = texto();
  assert.match(contenido, /Operario A/);
  assert.match(contenido, /Supervisor B/);
});

test('ABC-319 CA-05: informa error de carga y permite reintentar', async () => {
  respuestaGet = async () => json({ message: 'Orden 42 no encontrada' }, 404);
  await montar();

  assert.match(texto(), /Orden 42 no encontrada/);

  respuestaGet = async () => json(mockResumen());
  const botonReintentar = root.root.find(
    (n) => n.type === 'button' && n.children && n.children.includes('Reintentar')
  );
  assert.ok(botonReintentar);

  await act(async () => {
    botonReintentar.props.onClick();
  });

  assert.match(texto(), /60%/);
});

test('ABC-320: valida y registra nuevo avance sin superar la cantidad pendiente', async () => {
  let recargado = false;
  await montar({
    onAvanceRegistrado: () => {
      recargado = true;
    },
  });

  const inputCantidad = root.root.findByProps({ id: 'avance-cantidad' });
  const form = root.root.findByType('form');

  // Intento de enviar una cantidad superior a la pendiente (40)
  await act(async () => {
    inputCantidad.props.onChange({ target: { value: '50' } });
  });
  await act(async () => {
    form.props.onSubmit({ preventDefault() {} });
  });

  assert.match(texto(), /supera la cantidad pendiente/);
  assert.equal(llamadas.filter((l) => l.method === 'POST').length, 0);

  // Envío de cantidad válida (25)
  await act(async () => {
    inputCantidad.props.onChange({ target: { value: '25' } });
  });
  await act(async () => {
    form.props.onSubmit({ preventDefault() {} });
  });

  const llamadaPost = llamadas.find((l) => l.method === 'POST');
  assert.ok(llamadaPost);
  assert.equal(llamadaPost.path, '/api/produccion/avances/42');
  assert.equal(llamadaPost.body.cantidad, 25);
  assert.equal(recargado, true);
});

test('ABC-320: fuera de EN_PRODUCCION o sin permisos bloquea el registro', async () => {
  await montar({ enProduccion: false, estadoOrden: 'PLANIFICADA' });
  assert.doesNotMatch(texto(), /Registrar avance/);
  assert.match(texto(), /Solo se registra avance en estado En producción/);

  await montar({ enProduccion: true, permiteRegistrar: false });
  assert.doesNotMatch(texto(), /Registrar avance/);
  assert.match(texto(), /Sin permiso para registrar avances/);
});
