import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { createServer } from 'vite';

// ABC-459: vista, servicio y página reales; sesión y API de ABC-458 simuladas (fetch de prueba).
const globales = ['document', 'sessionStorage', 'localStorage', 'fetch', '__sesionRiesgo'];
const originales = globales.map((clave) => [clave, Object.getOwnPropertyDescriptor(globalThis, clave)]);
let vite, EntregasEnRiesgo, LogisticaPage, raiz, llamadas, responder;

const R = '/api/logistica/rutas/paradas-en-riesgo';
const parada = (extra = {}) => ({ rutaId: '5', rutaEstado: 'PLANIFICADA', reprogramable: true, fechaProgramada: '2026-11-25',
  vehiculoExternoId: 'VEH-1', choferExternoId: 'CHO-1', paradaId: '11', secuencia: 2, destino: 'Sucursal Norte',
  limiteEntrega: '2026-11-26T04:00:00.000Z', minutosRestantes: -600, motivo: 'VENCIDA',
  motivoDetalle: 'La fecha programada venció hace 10 h', ...extra });
const respuesta = (paradas) => ({ margenHoras: 24, calculadoEn: '2026-11-26T14:00:00.000Z', total: paradas.length, paradas });
const DOS = [parada(), parada({ rutaId: '8', rutaEstado: 'DESPACHADA', paradaId: '20', secuencia: 1, destino: 'Tienda Sur',
  fechaProgramada: '2026-11-26', motivo: 'POR_VENCER', minutosRestantes: 840, motivoDetalle: 'La fecha programada vence en 14 h' })];

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-riesgo-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
        return 'export function useSesion(){return {usuario:globalThis.__sesionRiesgo, salir(){}};}';
      }
    } }] });
  ({ default: EntregasEnRiesgo } = await vite.ssrLoadModule('/src/components/logistica/rutas/EntregasEnRiesgo.jsx'));
  ({ default: LogisticaPage } = await vite.ssrLoadModule('/src/pages/LogisticaPage.jsx'));
});

beforeEach(() => {
  llamadas = [];
  responder = () => Response.json(respuesta(DOS));
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (c) => (c === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__sesionRiesgo = { id: 7, permisos: ['logistica.rutas.consultar', 'logistica.rutas.gestionar'] };
  globalThis.fetch = async (url, opciones = {}) => {
    const u = new URL(url);
    if (u.pathname !== R) return Response.json([]);
    llamadas.push({ u, opciones });
    return responder();
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

const textoDe = (n) => (typeof n === 'string' ? n : n.children.map(textoDe).join(' '));
const texto = (n = raiz.root) => textoDe(n).replace(/\s+/g, ' ').trim();
const filas = () => raiz.root.findAll((n) => n.type === 'tr' && n.props['data-parada-id']).map((n) => texto(n));
const enlaces = () => raiz.root.findAll((n) => n.type === 'a');
const boton = (etiqueta) => raiz.root.findAll((n) => n.type === 'button' && texto(n) === etiqueta)[0];

function DetalleRuta() {
  const { id } = useParams();
  return React.createElement('p', null, `Detalle de la ruta ${id}`);
}
async function montar(puedeReprogramar = true) {
  await act(async () => {
    raiz = Renderer.create(React.createElement(MemoryRouter, null, React.createElement(Routes, null,
      React.createElement(Route, { path: '/', element: React.createElement(EntregasEnRiesgo, { puedeReprogramar }) }),
      React.createElement(Route, { path: '/logistica/rutas/:id', element: React.createElement(DetalleRuta) }))));
  });
}

test('consulta el endpoint de ABC-458 con Bearer y muestra ruta, parada, fecha programada y motivo', async () => {
  await montar();
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].opciones.headers.Authorization, 'Bearer token-prueba');
  assert.deepEqual(filas(), [
    'Ruta #5 2. Sucursal Norte 25/11/2026 Vencida La fecha programada venció hace 10 h Reprogramar',
    'Ruta #8 1. Tienda Sur 26/11/2026 Por vencer La fecha programada vence en 14 h Reprogramar',
  ]);
  assert.match(texto(), /2 paradas · margen de 24 h/);
});

test('"Reprogramar" lleva al detalle de la ruta correcta, donde se reprograma', async () => {
  await montar();
  assert.deepEqual(enlaces().map((a) => [a.props.href, a.props['aria-label']]),
    [['/logistica/rutas/5', 'Reprogramar ruta 5'], ['/logistica/rutas/8', 'Reprogramar ruta 8']]);
  await act(async () => enlaces()[1].props.onClick({ button: 0, defaultPrevented: false, preventDefault() {},
    metaKey: false, altKey: false, ctrlKey: false, shiftKey: false }));
  assert.equal(texto(), 'Detalle de la ruta 8');
});

test('sin permiso de gestionar rutas el acceso es "Ver ruta"', async () => {
  await montar(false);
  assert.deepEqual(enlaces().map((a) => texto(a)), ['Ver ruta', 'Ver ruta']);
  assert.equal(enlaces()[0].props.href, '/logistica/rutas/5');
});

test('lista vacía', async () => {
  responder = () => Response.json(respuesta([]));
  await montar();
  assert.match(texto(), /No hay entregas en riesgo de llegar tarde\./);
  assert.equal(filas().length, 0);
});

test('carga: muestra "Cargando entregas en riesgo…" hasta que responde', async () => {
  let soltar;
  responder = () => new Promise((r) => { soltar = () => r(Response.json(respuesta(DOS))); });
  await montar();
  assert.match(texto(), /Cargando entregas en riesgo…/);
  await act(async () => soltar());
  assert.doesNotMatch(texto(), /Cargando/);
  assert.equal(filas().length, 2);
});

test('error: muestra el mensaje y "Reintentar" vuelve a consultar; 403 explica el permiso', async () => {
  responder = () => Response.json({ message: 'Logística no disponible' }, { status: 503 });
  await montar();
  assert.match(texto(), /Logística no disponible/);
  responder = () => Response.json(respuesta(DOS));
  await act(async () => boton('Reintentar').props.onClick());
  assert.equal(filas().length, 2);
  responder = () => Response.json({ message: 'x' }, { status: 403 });
  await act(async () => boton('Actualizar').props.onClick());
  assert.match(texto(), /No tienes permiso para consultar las rutas/);
});

test('una respuesta sin listado de paradas se trata como error', async () => {
  responder = () => Response.json({ total: 1 });
  await montar();
  assert.match(texto(), /El servidor no devolvió un listado válido de entregas en riesgo/);
});

test('LogisticaPage muestra la vista solo a quien consulta rutas', async () => {
  const pagina = () => act(async () => {
    raiz = Renderer.create(React.createElement(MemoryRouter, null, React.createElement(LogisticaPage)));
  });
  globalThis.__sesionRiesgo = { id: 7, permisos: ['logistica.solicitudes.consultar', 'logistica.rutas.consultar'] };
  await pagina();
  assert.match(texto(), /Entregas en riesgo/);
  assert.equal(filas().length, 2);
  await act(async () => raiz.unmount());
  llamadas = [];
  globalThis.__sesionRiesgo = { id: 7, permisos: ['logistica.solicitudes.consultar'] };
  await pagina();
  assert.doesNotMatch(texto(), /Entregas en riesgo/);
  assert.equal(llamadas.length, 0);
});
