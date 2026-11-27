import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// ABC-471: widget, servicio y página reales; API del backend simulada (fetch de prueba).
const globales = ['document', 'sessionStorage', 'localStorage', 'fetch'];
const originales = globales.map((clave) => [clave, Object.getOwnPropertyDescriptor(globalThis, clave)]);
let vite, WidgetFpy, Pagina, periodoUltimosDias, raiz, llamadas, responder;

const M = '/api/produccion/dashboard/metricas';
// Forma de la respuesta de ABC-470: 90 conformes a la primera de 120 evaluadas = 75 %.
const calidad = (extra = {}) => ({ calidad: { total_evaluado: 120, porcentaje_conformes: 90, porcentaje_defectuosas: 10,
  fpy: 75, unidades_conformes_primera: 90, unidades_recuperadas: 18, porcentaje_conformes_final: 90, ...extra } });

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' } });
  ({ default: WidgetFpy } = await vite.ssrLoadModule('/src/components/produccion/WidgetFpy.jsx'));
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/DashboardProduccionPage.jsx'));
  ({ periodoUltimosDias } = await vite.ssrLoadModule('/src/components/logistica/dashboard/SelectorPeriodo.jsx'));
});

beforeEach(() => {
  llamadas = [];
  responder = () => Response.json(calidad());
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (c) => (c === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, opciones = {}) => {
    const u = new URL(url);
    if (u.pathname !== M) return Response.json([]);
    llamadas.push({ u, opciones });
    return responder(u);
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
const texto = () => textoDe(raiz.root).replace(/\s+/g, ' ').trim();
const total = () => raiz.root.findAll((n) => n.type === 'span' && n.props.className === 'dash-grafico-total').map(textoDe)[0] ?? null;
const enlace = () => raiz.root.findAll((n) => n.type === 'a').map((n) => n.props.href).find((h) => h.includes('FPY'));
const boton = (etiqueta) => raiz.root.findAll((n) => n.type === 'button' && textoDe(n).includes(etiqueta))[0];
async function montar(componente = WidgetFpy) {
  await act(async () => { raiz = Renderer.create(React.createElement(MemoryRouter, null, React.createElement(componente))); });
}
async function elegirPeriodo(desde, hasta) {
  await act(async () => raiz.root.findByProps({ id: 'dash-desde' }).props.onChange({ target: { value: desde } }));
  await act(async () => raiz.root.findByProps({ id: 'dash-hasta' }).props.onChange({ target: { value: hasta } }));
  await act(async () => raiz.root.findByType('form').props.onSubmit({ preventDefault() {} }));
}

test('muestra el FPY que devuelve el backend para los últimos 30 días, con Bearer', async () => {
  await montar();
  const { desde, hasta } = periodoUltimosDias(30);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].u.search, `?desde=${desde}&hasta=${hasta}`);
  assert.equal(llamadas[0].opciones.headers.Authorization, 'Bearer token-prueba');
  assert.equal(total(), '75%');
  assert.match(texto(), /90 de 120 unidades evaluadas fueron conformes a la primera/);
});

test('aclara que excluye reprocesos y no es el porcentaje de conformes', async () => {
  responder = () => Response.json(calidad({ fpy: 62.5, unidades_conformes_primera: 75, porcentaje_conformes: 87.5 }));
  await montar();
  assert.equal(total(), '62,5%');
  assert.match(texto(), /Excluye las unidades que pasaron por reproceso, aunque luego fueran conformes/);
  assert.match(texto(), /No es el porcentaje de conformes \(87,5%\)/);
});

test('cambiar el período vuelve a consultar con ese período y el enlace lo conserva', async () => {
  await montar();
  responder = () => Response.json(calidad({ fpy: 50, unidades_conformes_primera: 10, total_evaluado: 20 }));
  await elegirPeriodo('2026-11-01', '2026-11-15');
  assert.equal(llamadas.at(-1).u.search, '?desde=2026-11-01&hasta=2026-11-15');
  assert.equal(total(), '50%');
  assert.equal(enlace(), '/produccion/kpis/FPY?desde=2026-11-01&hasta=2026-11-15');
  await act(async () => boton('Todo').props.onClick());
  assert.equal(llamadas.at(-1).u.search, '');
  assert.equal(enlace(), '/produccion/kpis/FPY');
});

test('sin unidades evaluadas muestra "Sin datos"', async () => {
  responder = () => Response.json(calidad({ fpy: null, total_evaluado: 0, unidades_conformes_primera: 0, porcentaje_conformes: 0 }));
  await montar();
  assert.equal(total(), 'Sin datos');
  assert.match(texto(), /Sin unidades evaluadas en el período/);
  assert.doesNotMatch(texto(), /0%/);
});

test('carga: muestra "Cargando FPY…" hasta que responde', async () => {
  let soltar;
  responder = () => new Promise((r) => { soltar = () => r(Response.json(calidad())); });
  await montar();
  assert.match(texto(), /Cargando FPY…/);
  await act(async () => soltar());
  assert.doesNotMatch(texto(), /Cargando FPY…/);
  assert.equal(total(), '75%');
});

test('error: muestra el mensaje y "Reintentar" vuelve a consultar', async () => {
  responder = () => Response.json({ message: 'Servicio de producción no disponible' }, { status: 503 });
  await montar();
  assert.match(texto(), /Servicio de producción no disponible/);
  assert.equal(total(), null);
  responder = () => Response.json(calidad());
  await act(async () => boton('Reintentar').props.onClick());
  assert.equal(llamadas.length, 2);
  assert.equal(total(), '75%');
  responder = () => Response.json({ message: 'x' }, { status: 403 });
  await act(async () => boton('Todo').props.onClick());
  assert.match(texto(), /No tienes permiso para consultar el tablero de producción/);
});

test('una respuesta tardía de un período anterior no reemplaza a la actual', async () => {
  const pendientes = [];
  responder = (u) => new Promise((r) => pendientes.push(() => r(Response.json(calidad({ fpy: u.search ? 10 : 99 })))));
  await montar();
  await act(async () => boton('Todo').props.onClick());
  await act(async () => pendientes[1]());
  await act(async () => pendientes[0]());
  assert.equal(total(), '99%');
});

test('el widget está en la página del tablero de producción', async () => {
  await montar(Pagina);
  assert.match(texto(), /Conformes a la primera \(FPY\)/);
  assert.equal(total(), '75%');
});
