import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// ABC-497 y ABC-513: se montan las rutas, páginas y servicios reales; sesión y HTTP simulados.
const globales = ['document', 'sessionStorage', 'localStorage', 'fetch', '__sesionKpis'];
const originales = globales.map((clave) => [clave, Object.getOwnPropertyDescriptor(globalThis, clave)]);
let vite, Rutas, raiz, llamadas, respuestas;

const kpi = (nombre, extra = {}) => ({ kpi: nombre, valor: 82, meta: 80, unidad: '%', sentido: 'MAYOR_ES_MEJOR', desviacionPct: 0, color: 'VERDE', ...extra });
const ruta = (extra = {}) => ({ tipo: 'RUTA', id: '8', codigo: 'Ruta 8', estado: 'DESPACHADA', valor: 60, fecha: '2026-11-10',
  vehiculo_externo_id: 'VEH-1', placa: 'AAA-1', carga: { valor: '600.0000', unidad: 'kg' }, capacidad: { valor: '1000.0000', unidad: 'kg' },
  motivo: null, detalle: null, ...extra });
const detalle = (extra = {}) => ({ kpi: 'USO_CAPACIDAD', periodo: { desde: null, hasta: null }, disponible: true, valor: 60, unidad: '%', registros: [ruta()], ...extra });

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-kpis-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
        return 'export function useSesion(){return {usuario:globalThis.__sesionKpis, salir(){}};}';
      }
    } }] });
  ({ default: Rutas } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
});

beforeEach(() => {
  llamadas = [];
  respuestas = {};
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (c) => (c === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__sesionKpis = { id: 7, permisos: [{ codigo: 'logistica.rutas.consultar' }, { codigo: 'ordenes.consultar' }] };
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    llamadas.push(u);
    const r = respuestas[u.pathname];
    return r ? r() : Response.json({ message: 'sin simular' }, { status: 500 });
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

const L = '/api/logistica/dashboard/kpis';
const P = '/api/produccion/dashboard/kpis';
const texto = (n = raiz.toJSON()) => (n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(texto).join(' ') : texto(n.children));
const enlaces = () => raiz.root.findAll((n) => n.type === 'a').map((n) => n.props.href);
const clases = (c) => raiz.root.findAll((n) => typeof n.type === 'string' && String(n.props.className ?? '').includes(c));
async function abrir(camino) {
  await act(async () => {
    raiz = Renderer.create(React.createElement(MemoryRouter, { initialEntries: [camino] }, React.createElement(Rutas)));
  });
}

test('semáforo: muestra color, texto y meta según el backend', async () => {
  respuestas[P] = () => Response.json({ kpis: [kpi('FPY'), kpi('MERMA', { color: 'AMARILLO' }), kpi('TIEMPO_CICLO', { color: 'ROJO' })] });
  await abrir('/produccion/dashboard');
  for (const color of ['VERDE', 'AMARILLO', 'ROJO']) assert.equal(clases(`ts-badge--${color}`).length, 1);
  assert.match(texto(), /En meta/);
  assert.match(texto(), /Cerca de la meta/);
  assert.match(texto(), /Fuera de meta/);
  assert.match(texto(), /Meta: 80%/);
});

test('semáforo: un KPI sin meta o sin valor va sin color', async () => {
  respuestas[P] = () => Response.json({ kpis: [kpi('FPY', { meta: null, color: null }), kpi('MERMA', { valor: null, color: null })] });
  await abrir('/produccion/dashboard');
  assert.match(texto(), /Sin meta/);
  assert.match(texto(), /Sin datos/);
  for (const color of ['VERDE', 'AMARILLO', 'ROJO']) assert.equal(clases(`ts-badge--${color}`).length, 0);
});

test('semáforo: está en el tablero logístico y enlaza al detalle', async () => {
  respuestas[L] = () => Response.json({ kpis: [kpi('USO_CAPACIDAD')] });
  await abrir('/logistica/dashboard');
  assert.equal(clases('ts-badge--VERDE').length, 1);
  assert.ok(enlaces().includes('/logistica/kpis/USO_CAPACIDAD'));
});

test('semáforo: un error permite reintentar', async () => {
  await abrir('/produccion/dashboard');
  assert.match(texto(), /sin simular/);
  respuestas[P] = () => Response.json({ kpis: [kpi('FPY')] });
  await act(async () => raiz.root.find((n) => n.type === 'button' && n.children.includes('Reintentar')).props.onClick());
  assert.match(texto(), /En meta/);
});

test('detalle: conserva el período de la dirección y enlaza a la ruta y al tablero', async () => {
  respuestas[`${L}/USO_CAPACIDAD/detalle`] = () => Response.json(detalle());
  await abrir('/logistica/kpis/USO_CAPACIDAD?desde=2026-11-01&hasta=2026-11-30');
  assert.deepEqual(Object.fromEntries(llamadas.at(-1).searchParams), { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.ok(enlaces().includes('/logistica/rutas/8'));
  assert.ok(enlaces().includes('/logistica/dashboard'));
  assert.match(texto(), /60%/);
});

test('detalle: cambiar el período vuelve a consultar', async () => {
  respuestas[`${L}/USO_CAPACIDAD/detalle`] = () => Response.json(detalle());
  await abrir('/logistica/kpis/USO_CAPACIDAD?desde=2026-11-01&hasta=2026-11-30');
  await act(async () => raiz.root.find((n) => n.type === 'button' && n.children.includes('Todo')).props.onClick());
  assert.equal(llamadas.at(-1).search, '');
});

test('detalle: una ruta no calculable muestra el motivo', async () => {
  respuestas[`${L}/USO_CAPACIDAD/detalle`] = () => Response.json(detalle({ valor: null,
    registros: [ruta({ valor: null, motivo: 'UNIDAD_INCOMPATIBLE', detalle: 'La carga está en kg y la capacidad en caja' })] }));
  await abrir('/logistica/kpis/USO_CAPACIDAD');
  assert.match(texto(), /No calculable/);
  assert.match(texto(), /capacidad en caja/);
});

test('detalle del FPY: enlaza a la orden y muestra las causas de defecto', async () => {
  respuestas[`${P}/FPY/detalle`] = () => Response.json(detalle({ kpi: 'FPY', valor: 75,
    registros: [{ tipo: 'ORDEN', id: '3', codigo: 'OP-3', estado: 'FINALIZADA', valor: 75, conformes_primera: 75, evaluadas: 100 }],
    causas_defecto: [{ causa: 'Rayado', cantidad: 20 }, { causa: 'Golpe', cantidad: 5 }], unidades_defectuosas: 25 }));
  await abrir('/produccion/kpis/FPY');
  assert.ok(enlaces().includes('/ordenes/3'));
  assert.ok(texto().indexOf('Rayado') < texto().indexOf('Golpe'));
  assert.match(texto(), /Total defectuosas\s+25/);
});

test('detalle: vacío, no disponible y error', async () => {
  respuestas[`${L}/USO_CAPACIDAD/detalle`] = () => Response.json(detalle({ valor: null, registros: [] }));
  await abrir('/logistica/kpis/USO_CAPACIDAD');
  assert.match(texto(), /Sin registros en el período/);
  await act(async () => raiz.unmount());
  respuestas[`${L}/ENTREGAS_A_TIEMPO/detalle`] = () => Response.json(detalle({ disponible: false, valor: null, registros: [] }));
  await abrir('/logistica/kpis/ENTREGAS_A_TIEMPO');
  assert.match(texto(), /todavía no está disponible/);
  await act(async () => raiz.unmount());
  respuestas[`${L}/NADA/detalle`] = () => Response.json({ message: 'El KPI "NADA" no existe.' }, { status: 404 });
  await abrir('/logistica/kpis/NADA');
  assert.match(texto(), /no existe/);
});

test('detalle: sin permiso no consulta', async () => {
  globalThis.__sesionKpis = { id: 7, permisos: [] };
  await abrir('/logistica/kpis/USO_CAPACIDAD');
  assert.equal(llamadas.filter((u) => u.pathname.includes('/kpis')).length, 0);
});

test('detalle de cumplimiento de fecha y tiempo de ciclo: columnas propias y enlace a la orden', async () => {
  const orden = (extra) => ({ tipo: 'ORDEN', id: '4', codigo: 'OP-4', estado: 'FINALIZADA', ...extra });
  respuestas[`${P}/CUMPLIMIENTO_FECHA/detalle`] = () => Response.json(detalle({ kpi: 'CUMPLIMIENTO_FECHA', valor: 50,
    registros: [orden({ valor: 100, a_tiempo: true, fecha_programada: '2026-11-05', finalizada_en: '2026-11-05T10:00:00Z' }),
      orden({ id: '5', codigo: 'OP-5', valor: 0, a_tiempo: false, fecha_programada: '2026-11-05', finalizada_en: '2026-11-06T10:00:00Z' })] }));
  await abrir('/produccion/kpis/CUMPLIMIENTO_FECHA');
  assert.ok(enlaces().includes('/ordenes/4'));
  assert.match(texto(), /A tiempo/);
  assert.match(texto(), /Tarde/);
  assert.match(texto(), /05\/11\/2026/);
  await act(async () => raiz.unmount());
  respuestas[`${P}/TIEMPO_CICLO/detalle`] = () => Response.json(detalle({ kpi: 'TIEMPO_CICLO', valor: 26.5, unidad: 'horas',
    registros: [orden({ valor: 26.5, iniciada_en: '2026-11-04T08:00:00Z', finalizada_en: '2026-11-05T10:30:00Z' })] }));
  await abrir('/produccion/kpis/TIEMPO_CICLO');
  assert.match(texto(), /Iniciada/);
  assert.match(texto(), /26,5 horas/);
});

test('detalle de tiempo de atención: enlaza a la trazabilidad y a la ruta', async () => {
  respuestas[`${L}/TIEMPO_ATENCION/detalle`] = () => Response.json(detalle({ kpi: 'TIEMPO_ATENCION', valor: 26, unidad: 'horas',
    registros: [{ tipo: 'SOLICITUD', id: '1', codigo: 'Solicitud 1', estado: 'ENTREGADA', valor: 26, orden_id: '9', ruta_id: '2',
      creado_en: '2026-11-01T00:00:00Z', entregada_en: '2026-11-02T02:00:00Z' }] }));
  await abrir('/logistica/kpis/TIEMPO_ATENCION');
  assert.ok(enlaces().includes('/logistica/trazabilidad?ordenId=9'));
  assert.ok(enlaces().includes('/logistica/rutas/2'));
  assert.match(texto(), /26 horas/);
});

test('detalle desde el ranking: filtra por chofer, lo muestra y lo conserva al cambiar el período', async () => {
  respuestas[`${L}/ENTREGAS_A_TIEMPO/detalle`] = () => Response.json(detalle({ kpi: 'ENTREGAS_A_TIEMPO', valor: 50,
    recurso: { chofer: 'CHO-1', vehiculo: null },
    registros: [{ tipo: 'ENTREGA', id: '3', codigo: 'Destino A (ruta 8)', estado: 'ENTREGADA', valor: 0, a_tiempo: false, ruta_id: '8',
      fecha_programada: '2026-11-10', entregada_en: '2026-11-11T15:00:00Z', chofer_externo_id: 'CHO-1', vehiculo_externo_id: 'VEH-1' }] }));
  await abrir('/logistica/kpis/ENTREGAS_A_TIEMPO?chofer=CHO-1&desde=2026-11-01&hasta=2026-11-30');
  assert.deepEqual(Object.fromEntries(llamadas.at(-1).searchParams), { desde: '2026-11-01', hasta: '2026-11-30', chofer: 'CHO-1' });
  assert.match(texto(), /Chofer CHO-1/);
  assert.match(texto(), /Tarde/);
  assert.ok(enlaces().includes('/logistica/rutas/8'));
  await act(async () => raiz.root.find((n) => n.type === 'button' && n.children.includes('Todo')).props.onClick());
  assert.deepEqual(Object.fromEntries(llamadas.at(-1).searchParams), { chofer: 'CHO-1' });
});

test('detalle de incidencias: una fila por ruta con entregas e incidencias', async () => {
  respuestas[`${L}/INCIDENCIAS_RUTA/detalle`] = () => Response.json(detalle({ kpi: 'INCIDENCIAS_RUTA', valor: 150, unidad: 'por 100',
    registros: [{ tipo: 'RUTA_INCIDENCIAS', id: '8', codigo: 'Ruta 8', estado: 'DESPACHADA', valor: 150, fecha: '2026-11-10',
      entregas: 2, incidencias: 3, chofer_externo_id: 'CHO-2', vehiculo_externo_id: 'VEH-2' }] }));
  await abrir('/logistica/kpis/INCIDENCIAS_RUTA');
  assert.ok(enlaces().includes('/logistica/rutas/8'));
  assert.match(texto(), /150 por 100/);
});
