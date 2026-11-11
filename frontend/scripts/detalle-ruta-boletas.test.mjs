import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// ABC-393: boletas y lotes en el detalle de ruta, con enlaces sujetos a permisos.
let vite, Componente, root;

const detalle = {
  ruta: { id: '9', fechaProgramada: '2026-11-12', fechaOriginal: '2026-11-10', estado: 'DESPACHADA' },
  paradas: [
    { id: '11', secuencia: 1, destino: 'Tienda Central', estadoEntrega: 'ENTREGADA', boletas: [
      { id: '1', numero: 'BOL-2026-00001', estado: 'EMITIDA', ordenId: '2', items: [
        { referencia: 'LOT-GAL-001', cantidad: '6.0000' }, { referencia: 'LOT-GAL-002', cantidad: '2.5000' },
      ] },
    ] },
    { id: '12', secuencia: 2, destino: 'Sucursal', estadoEntrega: 'PENDIENTE', boletas: [
      { id: '2', numero: 'BOL-2026-00002', estado: 'ANULADA', ordenId: '2', items: [{ referencia: 'LOT-GAL-001', cantidad: '3.0000' }] },
    ] },
  ],
  lotes: [
    { referencia: 'LOT-GAL-001', cantidadVigente: '6.0000', boletas: ['BOL-2026-00001', 'BOL-2026-00002'] },
    { referencia: 'LOT-GAL-002', cantidadVigente: '2.5000', boletas: ['BOL-2026-00001'] },
  ],
  incidencias: [],
  reprogramaciones: [],
};

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' } });
  ({ default: Componente } = await vite.ssrLoadModule('/src/components/logistica/historial/BoletasLotesRuta.jsx'));
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); });

async function montar(props) {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, null, React.createElement(Componente, props)));
  });
}
const texto = () => JSON.stringify(root.toJSON());
const textoDe = (nodo) => (typeof nodo === 'string' ? nodo : nodo.children.map(textoDe).join(' '));
const enlaces = () => root.root.findAll((n) => typeof n.props?.to === 'string').map((n) => n.props.to)
  .filter((v, i, a) => a.indexOf(v) === i);

test('muestra número, estado, orden y lotes de cada boleta de la ruta', async () => {
  await montar({ detalle, puedeVerBoletas: true });
  const t = texto();
  for (const esperado of ['BOL-2026-00001', 'BOL-2026-00002', 'Emitida', 'Anulada', 'Tienda Central', 'LOT-GAL-001 × 6', 'LOT-GAL-002 × 2.5']) {
    assert.ok(t.includes(esperado), `falta ${esperado}`);
  }
});

test('el resumen de lotes muestra la cantidad vigente sin las anuladas', async () => {
  await montar({ detalle, puedeVerBoletas: true });
  const filas = root.root.findAllByType('tr').map(textoDe);
  assert.ok(filas.some((f) => f.includes('LOT-GAL-001') && f.includes('6') && f.includes('BOL-2026-00001, BOL-2026-00002')));
});

test('con permiso de boletas enlaza boletas y trazabilidad de lotes', async () => {
  await montar({ detalle, puedeVerBoletas: true });
  assert.deepEqual(enlaces(), [
    '/logistica/boletas/1', '/logistica/boletas/2',
    '/logistica/trazabilidad?loteId=LOT-GAL-001', '/logistica/trazabilidad?loteId=LOT-GAL-002',
  ]);
});

test('sin permiso de boletas muestra los datos pero no ofrece enlaces', async () => {
  await montar({ detalle, puedeVerBoletas: false });
  assert.deepEqual(enlaces(), []);
  assert.match(texto(), /BOL-2026-00001/);
  assert.match(texto(), /LOT-GAL-002/);
});

test('una ruta sin boletas muestra el estado vacío', async () => {
  await montar({ detalle: { ...detalle, paradas: [{ ...detalle.paradas[0], boletas: [] }], lotes: [] }, puedeVerBoletas: true });
  assert.match(texto(), /no tiene boletas asignadas/);
});
