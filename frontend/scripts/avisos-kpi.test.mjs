import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// ABC-501: componente, servicio y layout reales; sesión y API simuladas (fetch de prueba).
const globales = ['document', 'sessionStorage', 'localStorage', 'fetch', '__sesionAvisos'];
const originales = globales.map((clave) => [clave, Object.getOwnPropertyDescriptor(globalThis, clave)]);
let vite, AvisosKpi, MainLayout, raiz, llamadas, avisos, fallar;

const P = '/api/produccion/dashboard/kpis/avisos';
const L = '/api/logistica/dashboard/kpis/avisos';
const AMBOS = [{ codigo: 'ordenes.consultar' }, { codigo: 'logistica.rutas.consultar' }];

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-avisos-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
        return 'export function useSesion(){return {usuario:globalThis.__sesionAvisos, salir(){}};}';
      }
    } }] });
  ({ default: AvisosKpi } = await vite.ssrLoadModule('/src/components/ui/AvisosKpi.jsx'));
  ({ default: MainLayout } = await vite.ssrLoadModule('/src/layouts/MainLayout.jsx'));
});

beforeEach(() => {
  llamadas = [];
  fallar = false;
  avisos = {
    [P]: [{ id: 1, kpi: 'FPY', valor: 70, meta: 90, fecha: '2026-11-20T14:00:00.000Z', leido: false }],
    [L]: [
      { id: 5, kpi: 'TIEMPO_ATENCION', valor: 30, meta: 24, fecha: '2026-11-25T14:00:00.000Z', leido: false },
      { id: 6, kpi: 'ENTREGAS_A_TIEMPO', valor: 60, meta: 95, fecha: '2026-11-10T14:00:00.000Z', leido: true },
    ],
  };
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (c) => (c === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__sesionAvisos = { id: 7, nombre: 'Ana', permisos: AMBOS };
  globalThis.fetch = async (url, opciones = {}) => {
    const { pathname } = new URL(url);
    llamadas.push(`${opciones.method ?? 'GET'} ${pathname}`);
    if (fallar) return Response.json({ message: 'Servicio caído' }, { status: 503 });
    const base = pathname.startsWith(P) ? P : L;
    if (pathname.endsWith('/sin-leer')) return Response.json({ total: avisos[base].filter((a) => !a.leido).length });
    const leido = pathname.match(/\/avisos\/(\d+)\/leido$/);
    if (leido && opciones.method === 'PATCH') {
      const aviso = avisos[base].find((a) => a.id === Number(leido[1]));
      aviso.leido = true;
      return Response.json(aviso);
    }
    return Response.json(avisos[base]);
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
const botones = (etiqueta) => raiz.root.findAll((n) => n.type === 'button' && texto(n).includes(etiqueta));
const contador = () => raiz.root.findAll((n) => n.type === 'span' && n.props.className === 'avisos-kpi-contador').map((n) => String(n.props.children))[0] ?? null;
async function montar(usuario = globalThis.__sesionAvisos) {
  await act(async () => {
    raiz = Renderer.create(React.createElement(MemoryRouter, null, React.createElement(AvisosKpi, { usuario })));
  });
}
const clic = (boton) => act(async () => boton.props.onClick());

test('el indicador suma los avisos sin leer de Producción y Logística', async () => {
  await montar();
  assert.equal(contador(), '2');
  assert.deepEqual(llamadas.sort(), [`GET ${L}/sin-leer`, `GET ${P}/sin-leer`]);
});

test('la lista muestra KPI, valor, meta y fecha, del más reciente al más antiguo, con enlace al detalle', async () => {
  await montar();
  await clic(botones('Avisos de KPI')[0]);
  const items = raiz.root.findAll((n) => n.type === 'li').map((n) => texto(n));
  assert.equal(items.length, 3);
  assert.match(items[0], /Tiempo de atención/);
  assert.match(items[0], /Valor: 30 horas · Meta: 24 horas/);
  assert.match(items[0], /25\/11\/2026 10:00/);
  assert.match(items[1], /Valor: 70% · Meta: 90%/);
  assert.match(items[2], /Leído/);
  const enlaces = raiz.root.findAll((n) => n.type === 'a').map((n) => n.props.href);
  assert.deepEqual(enlaces, ['/logistica/kpis/TIEMPO_ATENCION', '/produccion/kpis/FPY', '/logistica/kpis/ENTREGAS_A_TIEMPO']);
});

test('marcar como leído llama al área correcta y el contador baja', async () => {
  await montar();
  await clic(botones('Avisos de KPI')[0]);
  await clic(botones('Marcar como leído')[1]);
  assert.ok(llamadas.includes(`PATCH ${P}/1/leido`));
  assert.equal(contador(), '1');
  await clic(botones('Marcar como leído')[0]);
  assert.ok(llamadas.includes(`PATCH ${L}/5/leido`));
  assert.equal(contador(), null);
  assert.equal(botones('Marcar como leído').length, 0);
});

test('lista vacía', async () => {
  avisos[P] = [];
  avisos[L] = [];
  await montar();
  await clic(botones('Avisos de KPI')[0]);
  assert.match(texto(), /No hay avisos de KPI en rojo\./);
  assert.equal(contador(), null);
});

test('carga: muestra "Cargando avisos…" mientras responde la API', async () => {
  await montar();
  const fetchReal = globalThis.fetch;
  const pendientes = [];
  globalThis.fetch = (...args) => new Promise((r) => pendientes.push(() => r(fetchReal(...args))));
  await clic(botones('Avisos de KPI')[0]);
  assert.match(texto(), /Cargando avisos…/);
  globalThis.fetch = fetchReal;
  await act(async () => pendientes.forEach((soltar) => soltar()));
  assert.doesNotMatch(texto(), /Cargando avisos…/);
});

test('error: muestra el mensaje y "Reintentar" vuelve a cargar', async () => {
  await montar();
  fallar = true;
  await clic(botones('Avisos de KPI')[0]);
  assert.match(texto(), /Servicio caído/);
  fallar = false;
  await clic(botones('Reintentar')[0]);
  assert.doesNotMatch(texto(), /Servicio caído/);
  assert.equal(raiz.root.findAll((n) => n.type === 'li').length, 3);
});

test('solo consulta las áreas con permiso', async () => {
  await montar({ id: 8, permisos: [{ codigo: 'logistica.rutas.consultar' }] });
  assert.deepEqual(llamadas, [`GET ${L}/sin-leer`]);
  assert.equal(contador(), '1');
});

test('el layout muestra el indicador solo a quien consulta Producción o Logística', async () => {
  const conLayout = async () => act(async () => {
    raiz = Renderer.create(React.createElement(MemoryRouter, null, React.createElement(MainLayout, null, 'contenido')));
  });
  await conLayout();
  assert.equal(botones('Avisos de KPI').length, 1);
  await act(async () => raiz.unmount());
  globalThis.__sesionAvisos = { id: 9, nombre: 'Luis', permisos: [{ codigo: 'recetas.gestionar' }] };
  llamadas = [];
  await conLayout();
  assert.equal(botones('Avisos de KPI').length, 0);
  assert.deepEqual(llamadas, []);
});
