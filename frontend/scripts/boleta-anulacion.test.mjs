import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createServer } from 'vite';

const originales = Object.fromEntries(['fetch', 'document', 'window', 'sessionStorage', 'localStorage'].map((key) => [key, globalThis[key]]));
const respuesta = (body, status = 200) => new Response(JSON.stringify(body), { status });
let vite, Pagina, servicio, root, boleta, llamadas, confirmaciones, confirmar, falloPost, falloRecarga, respuestaPost;

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-anulacion-prueba', enforce: 'pre', transform(_codigo, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
        return 'export function useSesion() { return { usuario: globalThis.__usuarioAnulacionPrueba }; }';
      }
    } }],
  });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/BoletaDetallePage.jsx'));
  servicio = await vite.ssrLoadModule('/src/services/boletasService.js');
});

beforeEach(() => {
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (key) => key === 'accessToken' ? 'token-prueba' : null,
    setItem() { throw new Error('No se permite guardar documentos en el navegador'); } };
  globalThis.localStorage = { getItem() { throw new Error('La prueba ya tiene una sesión autenticada'); },
    setItem() { throw new Error('No se permite guardar documentos en el navegador'); } };
  globalThis.__usuarioAnulacionPrueba = { id: '42', nombre_completo: 'Juan Pérez', rol: 'Encargado de Logística',
    permisos: ['logistica.boletas.gestionar', 'logistica.boletas.consultar'] };
  boleta = { id: '11', numero: 'BOL-2026-00011', estado: 'EMITIDA', responsableUsuarioId: '42',
    creadoEn: '2026-10-19T12:00:00.000Z', solicitudSalidaId: '27',
    items: [{ id: '1', referencia: 'LOTE-REAL', cantidad: '10.0000' }], historial: [] };
  llamadas = []; confirmaciones = []; confirmar = true; falloPost = 0; falloRecarga = false; respuestaPost = null;
  globalThis.window = { confirm(texto) { confirmaciones.push(texto); return confirmar; } };
  globalThis.fetch = async (url, opciones = {}) => {
    const path = new URL(url).pathname;
    const method = opciones.method || 'GET';
    llamadas.push({ path, method, headers: opciones.headers, body: opciones.body && JSON.parse(opciones.body) });
    if (path.endsWith('/anular')) {
      if (respuestaPost) return respuestaPost();
      if (falloPost) return respuesta({ message: `Error del servidor ${falloPost}` }, falloPost);
      boleta.estado = 'ANULADA';
      boleta.historial.push({ id: '1', estadoAnterior: 'EMITIDA', estadoNuevo: 'ANULADA',
        usuarioActorId: globalThis.__usuarioAnulacionPrueba.id, motivo: JSON.parse(opciones.body).motivo,
        fechaHora: '2026-10-19T13:00:00.000Z' });
      return respuesta(boleta, 201);
    }
    if (path.endsWith('/boletas/11')) {
      if (falloRecarga && llamadas.some((fila) => fila.method === 'POST')) return respuesta({ message: 'Consulta no disponible' }, 500);
      return respuesta(boleta);
    }
    if (path.endsWith('/solicitudes-salida/27')) return respuesta({ id: '27', ordenId: '8', destinoDocumental: 'Destino real' });
    if (path.endsWith('/ordenes/8')) return respuesta({ id: '8', codigo: 'ORD-REAL' });
    throw new Error(`Petición inesperada: ${method} ${path}`);
  };
});

afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => {
  await vite?.close();
  for (const [key, valor] of Object.entries(originales)) {
    if (valor === undefined) delete globalThis[key]; else globalThis[key] = valor;
  }
  delete globalThis.__usuarioAnulacionPrueba;
});

async function montar() {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter,
      { initialEntries: ['/logistica/boletas/11'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      React.createElement(Routes, null, React.createElement(Route,
        { path: '/logistica/boletas/:id', element: React.createElement(Pagina) }))));
  });
}
const texto = () => JSON.stringify(root.toJSON());
const botones = (etiqueta) => root.root.findAllByType('button').filter((boton) => boton.children.join('') === etiqueta);
async function abrir(motivo = 'Destino incorrecto') {
  await act(async () => botones('Anular boleta')[0].props.onClick());
  await act(async () => root.root.findByProps({ id: 'motivo-anulacion' }).props.onChange({ target: { value: motivo } }));
}
async function enviar() { await act(async () => { await root.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); }
const posts = () => llamadas.filter((fila) => fila.method === 'POST');

test('servicio: POST exacto con JSON y Bearer, codifica el ID', async () => {
  await servicio.anularBoleta('11/?', 'Motivo');
  assert.equal(llamadas[0].path, '/api/logistica/boletas/11%2F%3F/anular');
  assert.equal(llamadas[0].method, 'POST');
  assert.equal(llamadas[0].headers.Authorization, 'Bearer token-prueba');
  assert.equal(llamadas[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(llamadas[0].body, { motivo: 'Motivo' });
});

test('Encargado con permiso y EMITIDA: confirma, anula y recarga estado e historial sin sustituir a Juan Pérez', async () => {
  await montar();
  assert.equal(botones('Anular boleta').length, 1);
  await abrir('  Destino incorrecto  ');
  await enviar();
  assert.equal(confirmaciones.length, 1);
  assert.match(confirmaciones[0], /BOL-2026-00011/);
  assert.deepEqual(posts()[0].body, { motivo: 'Destino incorrecto' });
  const indice = llamadas.findIndex((fila) => fila.method === 'POST');
  assert.ok(llamadas.slice(indice + 1).some((fila) => fila.path.endsWith('/boletas/11') && fila.method === 'GET'));
  assert.match(texto(), /ANULADA/);
  assert.match(texto(), /Destino incorrecto/);
  assert.match(texto(), /Juan Pérez/);
  assert.match(texto(), /Historial de auditoría/);
  assert.equal(boleta.responsableUsuarioId, '42');
  assert.equal(botones('Anular boleta').length, 0);
});

for (const motivo of ['', '   \n ']) {
  test(`motivo ${JSON.stringify(motivo)}: rechaza sin confirmar ni enviar`, async () => {
    await montar(); await abrir(motivo); await enviar();
    assert.match(texto(), /motivo de anulación es obligatorio/);
    assert.equal(confirmaciones.length, 0); assert.equal(posts().length, 0);
  });
}

test('cancelar la confirmación conserva la boleta y no envía', async () => {
  confirmar = false;
  await montar(); await abrir(); await enviar();
  assert.equal(posts().length, 0); assert.equal(boleta.estado, 'EMITIDA');
  assert.equal(root.root.findByProps({ id: 'motivo-anulacion' }).props.value, 'Destino incorrecto');
});

test('el nombre Encargado de Logística sin permiso no autoriza la acción', async () => {
  globalThis.__usuarioAnulacionPrueba.permisos = ['logistica.boletas.consultar'];
  await montar(); assert.equal(botones('Anular boleta').length, 0); assert.equal(posts().length, 0);
});

test('el permiso autoriza aunque el nombre visible del rol sea diferente', async () => {
  globalThis.__usuarioAnulacionPrueba.rol = 'Otro rol';
  await montar(); assert.equal(botones('Anular boleta').length, 1);
});

for (const estado of ['BORRADOR', 'ANULADA']) {
  test(`${estado}: no permite iniciar una anulación`, async () => {
    boleta.estado = estado;
    await montar(); assert.equal(botones('Anular boleta').length, 0); assert.equal(posts().length, 0);
  });
}

for (const status of [400, 401, 403, 404, 409, 500]) {
  test(`HTTP ${status}: conserva documento y motivo, muestra error real sin éxito`, async () => {
    falloPost = status;
    await montar(); await abrir(); await enviar();
    assert.match(texto(), new RegExp(`Error del servidor ${status}`));
    assert.match(texto(), /BOL-2026-00011/); assert.match(texto(), /Juan Pérez/); assert.match(texto(), /LOTE-REAL/);
    assert.doesNotMatch(texto(), /anulada correctamente/);
    assert.equal(boleta.estado, 'EMITIDA'); assert.equal(boleta.historial.length, 0);
    assert.equal(root.root.findByProps({ id: 'motivo-anulacion' }).props.value, 'Destino incorrecto');
  });
}

test('una consulta fallida tras anular conserva el detalle y permite recargar sin reenviar el POST', async () => {
  falloRecarga = true;
  await montar(); await abrir(); await enviar();
  assert.match(texto(), /anulación fue confirmada/); assert.match(texto(), /BOL-2026-00011/);
  assert.equal(botones('Anular boleta').length, 0);
  falloRecarga = false;
  await act(async () => botones('Recargar detalle')[0].props.onClick());
  assert.match(texto(), /ANULADA/); assert.equal(posts().length, 1);
});

test('no muestra éxito hasta la respuesta y bloquea envíos repetidos mientras espera', async () => {
  let resolver;
  respuestaPost = () => new Promise((resolve) => { resolver = resolve; });
  await montar(); await abrir();
  let pendiente;
  await act(async () => { pendiente = root.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.match(texto(), /Anulando/); assert.doesNotMatch(texto(), /anulada correctamente/);
  assert.equal(botones('Anulando…')[0].props.disabled, true);
  await enviar(); assert.equal(posts().length, 1);
  await act(async () => { boleta.estado = 'ANULADA'; resolver(respuesta(boleta, 201)); await pendiente; });
  assert.match(texto(), /anulada correctamente/);
});

test('el actor diferente aparece en auditoría y no como responsable del documento', async () => {
  globalThis.__usuarioAnulacionPrueba.id = '55';
  globalThis.__usuarioAnulacionPrueba.nombre_completo = 'Ana';
  await montar(); await abrir(); await enviar();
  const datos = root.root.findByType('dl');
  assert.match(JSON.stringify(datos.children.map((nodo) => nodo.children.map((hijo) => hijo.children))), /Usuario 42/);
  assert.doesNotMatch(JSON.stringify(datos.children.map((nodo) => nodo.children.map((hijo) => hijo.children))), /Ana/);
  assert.match(texto(), /Ana/); assert.equal(boleta.responsableUsuarioId, '42');
});
