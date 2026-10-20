import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createServer } from 'vite';

const permisos = ['logistica.solicitudes.consultar', 'logistica.solicitudes.gestionar',
  'logistica.boletas.gestionar', 'logistica.boletas.consultar', 'ordenes.consultar'];
const orden = { id: 8, codigo: 'ORD-PRUEBA', estado: 'FINALIZADA' };
const lotes = [{ id: '4', codigo: 'LOTE-A', ordenId: '8', cantidad: '20.0000' },
  { id: '5', codigo: 'LOTE-B', ordenId: '8', cantidad: '20.0000' }];
const respuesta = (datos, status = 200) => new Response(JSON.stringify(datos), { status,
  headers: { 'Content-Type': 'application/json' } });
const fetchOriginal = globalThis.fetch;
const documentOriginal = globalThis.document;
const sessionOriginal = globalThis.sessionStorage;
const localOriginal = globalThis.localStorage;
let vite, LogisticaPage, BoletaNuevaPage, AppRoutes, servicio, formulario;
let root, solicitudes, llamadas, postRespuesta, listadoError;

before(async () => {
  // La sesión de pruebas sustituye solo la identidad. Los servicios HTTP y las
  // pantallas se cargan sin reemplazarlos, mediante el compilador existente Vite.
  vite = await createServer({ configFile: false, server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' }, plugins: [{ name: 'identidad-pruebas-logistica', enforce: 'pre',
      transform(_codigo, id) {
        if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
          return 'export function useSesion() { return { usuario: globalThis.__usuarioLogisticaPrueba }; }';
        }
      },
    }],
  });
  ({ default: LogisticaPage } = await vite.ssrLoadModule('/src/pages/LogisticaPage.jsx'));
  ({ default: BoletaNuevaPage } = await vite.ssrLoadModule('/src/pages/BoletaNuevaPage.jsx'));
  ({ default: AppRoutes } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
  servicio = await vite.ssrLoadModule('/src/services/boletasService.js');
  formulario = await vite.ssrLoadModule('/src/services/solicitudesSalidaFormulario.js');
});

beforeEach(() => {
  globalThis.document = { title: '' };
  // Se reutiliza el token de autenticación del proyecto. Cualquier intento de
  // almacenar solicitudes o boletas en el navegador hace fallar la prueba.
  globalThis.sessionStorage = { getItem: (clave) => clave === 'accessToken' ? 'token-prueba' : null,
    setItem: () => { throw new Error('No se permite persistir documentos en el navegador'); } };
  globalThis.localStorage = { getItem: () => null,
    setItem: () => { throw new Error('No se permite persistir documentos en el navegador'); } };
  globalThis.__usuarioLogisticaPrueba = { id: '42', permisos: permisos.map((codigo) => ({ codigo })) };
  solicitudes = [];
  llamadas = [];
  listadoError = 0;
  postRespuesta = null;
  globalThis.fetch = async (url, opciones = {}) => {
    const path = new URL(url).pathname;
    const method = opciones.method || 'GET';
    llamadas.push({ path, method, headers: opciones.headers, body: opciones.body ? JSON.parse(opciones.body) : undefined });
    if (path.endsWith('/ordenes/buscar')) return respuesta([orden]);
    if (path.endsWith('/ordenes/8')) return respuesta(orden);
    if (path.includes('/lotes/orden/')) return respuesta(lotes);
    if (path.endsWith('/solicitudes-salida') && method === 'GET') {
      return listadoError ? respuesta({ message: 'Fallo al consultar solicitudes' }, listadoError) : respuesta(solicitudes);
    }
    if (path.endsWith('/solicitudes-salida') && method === 'POST') {
      if (postRespuesta) return postRespuesta();
      const guardada = { ...JSON.parse(opciones.body), id: '27', estado: 'BORRADOR', responsableUsuarioId: '42' };
      solicitudes.push(guardada);
      return respuesta(guardada, 201);
    }
    if (path.endsWith('/boletas') && method === 'POST') {
      return respuesta({ ...JSON.parse(opciones.body), id: '11', estado: 'BORRADOR' }, 201);
    }
    throw new Error(`Petición inesperada: ${method} ${url}`);
  };
});

afterEach(async () => { if (root) await act(async () => { root.unmount(); }); root = null; });
after(async () => {
  await vite?.close();
  globalThis.fetch = fetchOriginal;
  for (const [clave, valor] of [['document', documentOriginal], ['sessionStorage', sessionOriginal], ['localStorage', localOriginal]]) {
    if (valor === undefined) delete globalThis[clave]; else globalThis[clave] = valor;
  }
  delete globalThis.__usuarioLogisticaPrueba;
});

function RutaActual() { return React.createElement('output', { 'data-ruta': useLocation().pathname }); }
async function montar(Pagina = LogisticaPage, ruta = '/') {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, { initialEntries: [ruta], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      React.createElement(Pagina), React.createElement(RutaActual)));
  });
}
const texto = () => JSON.stringify(root.toJSON());
async function cambiar(id, value) {
  await act(async () => { await root.root.findByProps({ id }).props.onChange({ target: { value } }); });
}
async function completar() {
  await cambiar('salida-orden', '8');
  await cambiar('salida-destino', 'Destino documental');
  await cambiar('salida-motivo', 'Traslado solicitado');
  await cambiar('salida-lote-0', 'LOTE-A');
  await cambiar('salida-cantidad-0', '10');
}
async function enviar() { await act(async () => { await root.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); }

test('servicio: envia Bearer y contrato exacto, excluyendo estado y responsable del cliente', async () => {
  const datos = { ordenId: '8', destinoDocumental: 'Destino', motivo: 'Motivo',
    items: [{ referencia: 'LOTE-A', cantidad: '10.0000', inventado: true }], estado: 'EMITIDA', responsableUsuarioId: '999' };
  const creada = await servicio.crearSolicitudSalida(datos);
  const enviada = llamadas[0];
  assert.equal(enviada.headers.Authorization, 'Bearer token-prueba');
  assert.equal(enviada.method, 'POST');
  assert.deepEqual(enviada.body, { ordenId: '8', destinoDocumental: 'Destino', motivo: 'Motivo',
    items: [{ referencia: 'LOTE-A', cantidad: '10.0000' }] });
  assert.equal(creada.id, '27');
});

test('pantalla: carga solicitudes guardadas y opciones de orden desde la API', async () => {
  solicitudes = [{ id: '26', ordenId: '8', destinoDocumental: 'Destino persistido', motivo: 'Salida', estado: 'BORRADOR', items: [] }];
  await montar();
  assert.match(texto(), /Destino persistido/);
  assert.match(texto(), /ORD-PRUEBA/);
  assert.equal(llamadas.filter((fila) => fila.method === 'POST').length, 0);
});

test('pantalla: POST confirmado refresca GET; al volver a Crear boleta aparece y se envia la solicitud nueva', async () => {
  await montar();
  await completar();
  await enviar();
  assert.match(texto(), /registrada en el servidor/);
  assert.match(texto(), /BORRADOR/);
  assert.deepEqual(solicitudes[0].items, [{ referencia: 'LOTE-A', cantidad: '10.0000' }]);
  const indicePost = llamadas.findIndex((fila) => fila.method === 'POST');
  assert.ok(llamadas.slice(indicePost + 1).some((fila) => fila.path.endsWith('/solicitudes-salida') && fila.method === 'GET'));
  await act(async () => { root.unmount(); });
  root = null;
  await montar(BoletaNuevaPage);
  assert.match(texto(), /Solicitud #/);
  const opciones = root.root.findByProps({ id: 'solicitud-salida' }).findAllByType('option');
  assert.ok(opciones.some((opcion) => opcion.props.value === '27'));
  await cambiar('solicitud-salida', '27');
  await enviar();
  assert.deepEqual(llamadas.find((fila) => fila.path.endsWith('/boletas') && fila.method === 'POST').body,
    { solicitudSalidaId: '27', items: [{ referencia: 'LOTE-A', cantidad: '10.0000' }] });
  assert.equal(root.root.findByType('output').props['data-ruta'], '/logistica/boletas/11');
});

test('pantalla: no muestra exito mientras el servidor no confirme el POST', async () => {
  let confirmar;
  postRespuesta = () => new Promise((resolve) => { confirmar = resolve; });
  await montar();
  await completar();
  let pendiente;
  await act(async () => { pendiente = root.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.doesNotMatch(texto(), /registrada en el servidor/);
  assert.match(texto(), /Guardando/);
  await act(async () => {
    confirmar(respuesta({ id: '27', estado: 'BORRADOR', items: [{ referencia: 'LOTE-A', cantidad: '10.0000' }] }, 201));
    await pendiente;
  });
  assert.match(texto(), /registrada en el servidor/);
});

for (const status of [401, 403, 404, 409, 500]) {
  test(`pantalla: HTTP ${status} conserva el error real sin mostrar exito ni agregar solicitudes`, async () => {
    postRespuesta = () => respuesta({ message: `Error real ${status}` }, status);
    await montar();
    await completar();
    await enviar();
    assert.match(texto(), new RegExp(`HTTP ${status}: Error real ${status}`));
    assert.doesNotMatch(texto(), /registrada en el servidor/);
    assert.equal(solicitudes.length, 0);
  });
}

test('pantalla: distingue solicitud guardada de fallo posterior al refrescar el listado', async () => {
  postRespuesta = () => {
    listadoError = 500;
    return respuesta({ id: '27', estado: 'BORRADOR', items: [{ referencia: 'LOTE-A', cantidad: '10.0000' }] }, 201);
  };
  await montar();
  await completar();
  await enviar();
  assert.match(texto(), /registrada en el servidor/);
  assert.match(texto(), /HTTP 500: Fallo al consultar solicitudes/);
  assert.equal(llamadas.filter((fila) => fila.method === 'POST').length, 1);
});

test('pantalla: no registra cantidades cero o negativas, ni referencias que no pertenecen a la orden', async () => {
  await montar();
  await completar();
  for (const cantidad of ['0', '-1']) {
    await cambiar('salida-cantidad-0', cantidad);
    await enviar();
    assert.match(texto(), /cantidad debe ser positiva/);
  }
  await cambiar('salida-cantidad-0', '1');
  await cambiar('salida-lote-0', 'LOTE-INVENTADO');
  await enviar();
  assert.match(texto(), /Selecciona una referencia de lote/);
  assert.equal(llamadas.filter((fila) => fila.method === 'POST').length, 0);
});

test('pantalla: agrega varios items y envia cantidades canonicas sin convertirlas a number', async () => {
  await montar();
  await completar();
  await act(async () => { root.root.findAllByType('button').find((boton) => boton.children.join('') === 'Agregar ítem').props.onClick(); });
  await cambiar('salida-lote-1', 'LOTE-B');
  await cambiar('salida-cantidad-1', '0.0001');
  await enviar();
  assert.deepEqual(solicitudes[0].items, [{ referencia: 'LOTE-A', cantidad: '10.0000' }, { referencia: 'LOTE-B', cantidad: '0.0001' }]);
});

test('pantalla: un rol sin ordenes.consultar ve el permiso faltante y no consulta datos de Produccion', async () => {
  globalThis.__usuarioLogisticaPrueba.permisos = permisos.filter((codigo) => codigo !== 'ordenes.consultar');
  await montar();
  assert.match(texto(), /Necesitas el permiso ordenes.consultar/);
  assert.equal(root.root.findAllByType('form').length, 0);
  assert.equal(llamadas.some((fila) => fila.path.includes('/api/produccion/')), false);
});

test('pantalla: permiso de consultar solicitudes permite listar pero no registrar', async () => {
  globalThis.__usuarioLogisticaPrueba.permisos = ['logistica.solicitudes.consultar'];
  await montar();
  assert.match(texto(), /logistica.solicitudes.gestionar/);
  assert.equal(root.root.findAllByType('form').length, 0);
  assert.equal(llamadas.length, 1);
});

test('Crear boleta informa los permisos faltantes sin intentar saltarse la autorizacion', async () => {
  globalThis.__usuarioLogisticaPrueba.permisos = ['logistica.boletas.gestionar'];
  await montar(BoletaNuevaPage);
  assert.match(texto(), /logistica.solicitudes.consultar, ordenes.consultar/);
  assert.equal(llamadas.length, 0);
});

test('servicio: respuesta 201 incompleta no se considera una solicitud confirmada', async () => {
  postRespuesta = () => respuesta({}, 201);
  await assert.rejects(servicio.crearSolicitudSalida({ ordenId: '8', destinoDocumental: 'Destino', motivo: 'Motivo', items: [] }), /no confirmó/);
});

test('validacion: cantidades grandes, duplicados y orden no seleccionada', () => {
  const datos = { orden, lotes, destinoDocumental: 'Destino', motivo: 'Motivo', items: [{ referencia: 'LOTE-A', cantidad: '9999999999.9999' }] };
  assert.equal(formulario.datosSolicitudSalida(datos).items[0].cantidad, '9999999999.9999');
  assert.throws(() => formulario.datosSolicitudSalida({ ...datos, orden: null }), /Selecciona una orden/);
  assert.throws(() => formulario.datosSolicitudSalida({ ...datos, items: [...datos.items, ...datos.items] }), /No repitas/);
});

test('ruta protegida: consultar boletas no autoriza acceder a solicitudes de salida', async () => {
  globalThis.__usuarioLogisticaPrueba.permisos = ['logistica.boletas.consultar'];
  await montar(AppRoutes, '/logistica/inicio');
  assert.match(texto(), /Acceso denegado/);
  assert.equal(llamadas.length, 0);
});

test('ruta protegida: permiso de consultar solicitudes permite entrar y listar sin permiso de boletas', async () => {
  globalThis.__usuarioLogisticaPrueba.permisos = ['logistica.solicitudes.consultar'];
  await montar(AppRoutes, '/logistica/inicio');
  assert.match(texto(), /Solicitudes guardadas/);
  assert.doesNotMatch(texto(), /Acceso denegado/);
  assert.ok(llamadas.some((fila) => fila.path.endsWith('/solicitudes-salida')));
});

test('inicio de Logistica sigue llevando a solicitudes aunque ahora tenga lectura de ordenes', async () => {
  await montar(AppRoutes, '/');
  assert.equal(root.root.findByType('output').props['data-ruta'], '/logistica/inicio');
  assert.match(texto(), /Solicitudes guardadas/);
});
