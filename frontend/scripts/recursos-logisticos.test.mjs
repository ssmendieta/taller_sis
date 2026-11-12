import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

// HTTP simulado; se renderiza la página real y se comprueba lo que ve el usuario.
const originales = new Map(['fetch', 'document', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
let vite, Pagina, formato, root;
before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' } });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/RecursosLogisticosPage.jsx'));
  formato = await vite.ssrLoadModule('/src/utils/format.js');
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: () => 'sesion-simulada' };
  globalThis.localStorage = { getItem: () => null };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => {
  await vite?.close();
  for (const [k, v] of originales) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
});

async function montar(origen, status = 200) {
  globalThis.fetch = async (url) => new Response(JSON.stringify(status === 200 ? {
    fecha: new URL(url).searchParams.get('fecha'), origen,
    generadoEn: '2026-11-09T18:00:00Z', sincronizadoEn: '2026-11-09T18:30:00Z',
    aviso: origen === 'RESPALDO' ? { mensaje: 'El ERP no respondió; se usa la última copia válida.' } : null,
    vehiculos: [], choferes: [], totales: { vehiculos: 0, choferes: 0 },
  } : { codigo: 'RECURSOS_NO_DISPONIBLES', message: 'ERP caído y sin respaldo.' }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  await act(async () => { root = Renderer.create(React.createElement(Pagina)); });
}
const texto = (nodo) => typeof nodo === 'string' ? nodo : Array.isArray(nodo)
  ? nodo.map(texto).join(' ') : texto(nodo?.children ?? []);

test('ante caída del ERP muestra aviso, fecha de sincronización y antigüedad de la copia', async () => {
  await montar('RESPALDO');
  const alertas = root.root.findAllByProps({ role: 'alert' });
  assert.equal(alertas.length, 1);
  const mensaje = texto(alertas[0].toJSON ? alertas[0].toJSON() : alertas[0]);
  assert.match(mensaje, /Copia de respaldo/);
  assert.match(mensaje, /El ERP no respondió/);
  for (const valor of ['2026-11-09T18:00:00Z', '2026-11-09T18:30:00Z']) {
    const { fecha, hora } = formato.formatearFechaHora(valor);
    assert.ok(mensaje.includes(fecha));
    assert.ok(mensaje.includes(hora));
  }
  assert.match(mensaje, /Verifica la disponibilidad/);
  assert.match(texto(root.toJSON()), /no reserva los recursos/);
});
test('una consulta vigente muestra origen ERP y no una alerta de respaldo', async () => {
  await montar('ERP');
  assert.equal(root.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.match(texto(root.toJSON()), /Datos del ERP/);
});
test('sin ERP ni copia informa indisponibilidad y no muestra recursos vigentes', async () => {
  await montar(null, 503);
  assert.match(texto(root.toJSON()), /Recursos no disponibles/);
  assert.doesNotMatch(texto(root.toJSON()), /Datos del ERP|Copia de respaldo/);
});
