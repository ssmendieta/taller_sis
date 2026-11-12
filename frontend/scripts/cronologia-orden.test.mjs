import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Link, MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

let vite, Rutas, servicio, root, llamadas, responder;
const originales = Object.fromEntries(
  ['fetch', 'document', 'sessionStorage', 'localStorage'].map((clave) => [clave, globalThis[clave]]),
);
const json = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status, headers: { 'Content-Type': 'application/json' },
});
const evento = (tipo, datos, id = '1') => ({
  clave: `${tipo}:${id}`, id, tipo, fechaHora: '2026-11-10T10:00:00Z',
  usuarioId: '7', usuarioNombre: 'Ana Pérez', datos,
});
const detalle = (id = 42, eventos = [
  evento('ESTADO', { estadoAnterior: 'PENDIENTE', estadoNuevo: 'PLANIFICADA' }),
  evento('AVANCE', { cantidad: '2.1250', unidad: 'kg' }),
  evento('CONFORME', { cantidad: '1.0000', unidad: 'kg' }),
  evento('DEFECTUOSO', { cantidad: '1.0000', unidad: 'kg', causaDefecto: 'Sellado' }),
  evento('PERDIDA', { cantidad: '0.2500', unidad: 'kg', materialId: '3', materialNombre: 'Harina', motivo: 'Derrame' }),
  evento('OBSERVACION', { descripcion: 'Observación registrada' }),
  evento('INCIDENCIA', { descripcion: '<script>texto de prueba</script>' }),
  evento('LOTE', { codigo: 'LOTE-334', cantidad: '2.1250', unidad: 'kg' }),
  evento('REPROCESO', { cantidadProcesada: '3.0000', cantidadRecuperada: '2.0000', cantidadDescartada: '1.0000', unidad: 'kg' }),
]) => ({ orden: { id, codigo: `ORD-${id}`, estado: 'PLANIFICADA', unidadProducto: 'kg' }, eventos });

before(async () => {
  vite = await createServer({
    configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{
      name: 'sesion-cronologia-prueba', enforce: 'pre',
      transform(_code, id) {
        if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
          return 'export function useSesion(){return {usuario:globalThis.__usuarioCronologia,salir(){}};}';
        }
      },
    }],
  });
  ({ default: Rutas } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
  servicio = await vite.ssrLoadModule('/src/services/historialProduccionService.js');
});
beforeEach(() => {
  llamadas = [];
  responder = () => json(detalle());
  globalThis.__usuarioCronologia = { id: '7', permisos: ['ordenes.consultar'] };
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (key) => key === 'accessToken' ? 'token-cronologia' : null };
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, opciones = {}) => {
    const ruta = new URL(url).pathname;
    llamadas.push({ ruta, authorization: opciones.headers?.Authorization, signal: opciones.signal });
    return responder(ruta);
  };
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});
after(async () => {
  await vite?.close();
  Object.assign(globalThis, originales);
  delete globalThis.__usuarioCronologia;
});
const texto = () => JSON.stringify(root.toJSON());
async function montar(id = '42') {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, { initialEntries: [`/produccion/historial/ordenes/${id}`] },
      React.createElement(React.Fragment, null, React.createElement(Rutas),
        React.createElement(Link, { to: '/produccion/historial/ordenes/43' }, 'Otra orden de prueba')),
    ));
  });
}

test('entra desde AppRoutes y muestra cada tipo de evento con fecha y autor', async () => {
  await montar();
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].ruta, '/api/produccion/historial/ordenes/42/eventos');
  assert.equal(llamadas[0].authorization, 'Bearer token-cronologia');
  for (const visible of ['ORD-42', 'Avance de producción', 'Resultado conforme', 'Resultado defectuoso',
    'Pérdida de materia prima', 'Observación registrada', 'LOTE-334', 'Reproceso', 'Recuperado', 'Ana Pérez', '06:00']) {
    assert.ok(texto().includes(visible), visible);
  }
  assert.equal(root.root.findAllByType('li').filter((nodo) => nodo.findAllByType('article').length).length, 9);
  assert.equal(root.root.findAllByType('script').length, 0);
  assert.ok(root.root.findAllByType('a').some(({ props }) => props.href === '/ordenes/42'));
  assert.ok(root.root.findAllByType('a').some(({ props }) => props.href === '/produccion/historial'));
});

test('muestra el estado vacío y permite volver a la orden', async () => {
  responder = () => json(detalle(42, []));
  await montar();
  assert.match(texto(), /todavía no tiene eventos registrados/);
  assert.ok(root.root.findAllByType('a').some(({ props }) => props.href === '/ordenes/42'));
});

test('recupera una consulta fallida con Reintentar', async () => {
  responder = () => json({ message: 'Fallo temporal' }, 503);
  await montar();
  assert.match(texto(), /Fallo temporal/);
  responder = () => json(detalle());
  const boton = root.root.findAllByType('button').find(({ children }) => children.includes('Reintentar'));
  await act(async () => boton.props.onClick());
  assert.match(texto(), /ORD-42/);
  assert.doesNotMatch(texto(), /Fallo temporal/);
});

for (const [status, esperado] of [[401, /Tu sesión expiró/], [403, /No tienes permiso/], [404, /La orden de producción no existe/]]) {
  test(`presenta el error HTTP ${status} sin mostrar datos anteriores`, async () => {
    responder = () => json({ message: 'Error de prueba' }, status);
    await montar();
    assert.match(texto(), esperado);
    assert.doesNotMatch(texto(), /ORD-42/);
  });
}

test('sin el permiso requerido la ruta no hace consultas', async () => {
  globalThis.__usuarioCronologia.permisos = [];
  await montar();
  assert.match(texto(), /Acceso denegado/);
  assert.equal(llamadas.length, 0);
});

test('descarta respuestas tardías de otra orden incluso si fetch ignora abort', async () => {
  let resolverAnterior;
  responder = (ruta) => ruta.endsWith('/42/eventos')
    ? new Promise((resolve) => { resolverAnterior = resolve; })
    : json(detalle(43, []));
  await montar();
  const enlace = root.root.findAllByType('a').find(({ props }) => props.href.endsWith('/43'));
  await act(async () => enlace.props.onClick({ button: 0, preventDefault() {} }));
  assert.match(texto(), /ORD-43/);
  await act(async () => resolverAnterior(json(detalle())));
  assert.match(texto(), /ORD-43/);
  assert.doesNotMatch(texto(), /ORD-42/);
  assert.equal(llamadas[0].signal.aborted, true);
});

test('rechaza respuestas de otra orden o claves duplicadas', async () => {
  responder = () => json(detalle(43));
  await assert.rejects(servicio.consultarEventosOrden('42'), /formato inválido/);
  const duplicado = detalle();
  duplicado.eventos.push(duplicado.eventos[0]);
  responder = () => json(duplicado);
  await assert.rejects(servicio.consultarEventosOrden('42'), /formato inválido/);
});

test('conserva cantidades del servidor y valida los ids antes de consultar', async () => {
  const datos = await servicio.consultarEventosOrden('42');
  assert.equal(datos.eventos[1].datos.cantidad, '2.1250');
  llamadas = [];
  for (const id of ['0', '-1', '1.2', '9007199254740992']) {
    await assert.rejects(servicio.consultarEventosOrden(id), /identificador/);
  }
  assert.equal(llamadas.length, 0);
});
