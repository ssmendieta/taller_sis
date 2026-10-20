import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createServer } from 'vite';

const permisos = ['logistica.solicitudes.consultar', 'logistica.solicitudes.gestionar',
  'logistica.boletas.gestionar', 'logistica.boletas.consultar', 'ordenes.consultar'];
const orden = { id: 8, codigo: 'ORD-PRUEBA', estado: 'FINALIZADA', producto_id: 3, producto: { codigo: 'P-PRUEBA' } };
const lotes = [{ id: '4', codigo: 'LOTE-A', ordenId: '8', productoId: '3', cantidad: '20.0000' },
  { id: '5', codigo: 'LOTE-B', ordenId: '8', productoId: '3', cantidad: '20.0000' }];
const respuesta = (datos, status = 200) => new Response(JSON.stringify(datos), { status,
  headers: { 'Content-Type': 'application/json' } });
const fetchOriginal = globalThis.fetch;
const documentOriginal = globalThis.document;
const sessionOriginal = globalThis.sessionStorage;
const localOriginal = globalThis.localStorage;
let vite, LogisticaPage, BoletaNuevaPage, AppRoutes, servicio, formulario;
let root, solicitudes, llamadas, postRespuesta, listadoError, ordenesDisponibles, respuestaDisponibilidad;
let respuestaOrden, respuestaLotes, postBoletaRespuesta;

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
  ordenesDisponibles = [orden];
  respuestaOrden = () => respuesta(orden);
  respuestaLotes = () => respuesta(lotes);
  postBoletaRespuesta = null;
  respuestaDisponibilidad = (codigo) => respuesta({ ordenCodigo: codigo, ordenId: '8',
    totalConforme: '100.0000', totalEmitido: '60.0000', saldoDocumental: '40.0000' });
  globalThis.fetch = async (url, opciones = {}) => {
    const path = new URL(url).pathname;
    const method = opciones.method || 'GET';
    llamadas.push({ path, method, headers: opciones.headers, signal: opciones.signal, body: opciones.body ? JSON.parse(opciones.body) : undefined });
    if (path.includes('/disponibilidad/')) return respuestaDisponibilidad(decodeURIComponent(path.split('/disponibilidad/')[1]));
    if (path.endsWith('/ordenes/buscar')) return respuesta(ordenesDisponibles);
    if (path.endsWith('/ordenes/8')) return respuestaOrden();
    if (path.includes('/lotes/orden/')) return respuestaLotes();
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
      if (postBoletaRespuesta) return postBoletaRespuesta();
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

const llamadasDisponibilidad = () => llamadas.filter((llamada) => llamada.path.includes('/disponibilidad/'));
const valoresDisponibilidad = () => root.root.findByProps({ 'aria-labelledby': 'salida-disponibilidad-titulo' })
  .findAllByType('dd').map((elemento) => elemento.children.join(''));

test('ABC-127: servicio usa el código codificado, la ruta del Gateway y el Bearer de la sesión', async () => {
  await servicio.obtenerDisponibilidadDocumental(' ORD / 8? ');
  assert.equal(llamadas[0].path, '/api/logistica/disponibilidad/ORD%20%2F%208%3F');
  assert.equal(llamadas[0].method, 'GET');
  assert.equal(llamadas[0].headers.Authorization, 'Bearer token-prueba');
});

test('ABC-127: antes de seleccionar una orden muestra el estado vacío sin consultar disponibilidad', async () => {
  await montar(AppRoutes, '/logistica/inicio');
  assert.match(texto(), /Selecciona una orden para consultar su disponibilidad documental/);
  assert.equal(llamadasDisponibilidad().length, 0);
  assert.deepEqual(valoresDisponibilidad(), []);
});

test('ABC-127: la selección consulta por código y muestra los tres valores exactos del backend', async () => {
  respuestaDisponibilidad = (codigo) => respuesta({ ordenCodigo: codigo, ordenId: '8',
    totalConforme: '100000000000.1234', totalEmitido: '60.0000', saldoDocumental: '99999999940.1234' });
  await montar(); await cambiar('salida-orden', '8');
  assert.equal(llamadasDisponibilidad()[0].path, '/api/logistica/disponibilidad/ORD-PRUEBA');
  assert.deepEqual(valoresDisponibilidad(), ['100000000000.1234', '60.0000', '99999999940.1234']);
  assert.match(texto(), /Total de unidades conformes/);
  assert.match(texto(), /Total incluido en boletas EMITIDAS/);
  assert.match(texto(), /Saldo documental disponible/);
});

test('ABC-127: respeta el saldo recibido sin reconstruirlo desde los totales', async () => {
  respuestaDisponibilidad = (codigo) => respuesta({ ordenCodigo: codigo, ordenId: '8',
    totalConforme: '100.0000', totalEmitido: '60.0000', saldoDocumental: '7.1250' });
  await montar(); await cambiar('salida-orden', '8');
  assert.deepEqual(valoresDisponibilidad(), ['100.0000', '60.0000', '7.1250']);
});

test('ABC-127: carga sin mostrar ceros mientras espera la respuesta', async () => {
  let resolver;
  respuestaDisponibilidad = () => new Promise((resolve) => { resolver = resolve; });
  await montar(); await cambiar('salida-orden', '8');
  assert.match(texto(), /Consultando disponibilidad documental/);
  assert.deepEqual(valoresDisponibilidad(), []);
  await act(async () => resolver(respuesta({ ordenCodigo: orden.codigo, ordenId: '8',
    totalConforme: '100.0000', totalEmitido: '60.0000', saldoDocumental: '40.0000' })));
  assert.deepEqual(valoresDisponibilidad(), ['100.0000', '60.0000', '40.0000']);
});

for (const status of [401, 403, 404, 500, 503]) {
  test(`ABC-127: error HTTP ${status} no se convierte en cero y permite reintentar`, async () => {
    respuestaDisponibilidad = () => respuesta({ message: 'Disponibilidad no disponible' }, status);
    await montar(); await cambiar('salida-orden', '8');
    assert.match(texto(), new RegExp(`HTTP ${status}: Disponibilidad no disponible`));
    assert.deepEqual(valoresDisponibilidad(), []);
    if (status === 403) assert.match(texto(), /Permiso necesario: logistica.boletas.consultar/);
    respuestaDisponibilidad = (codigo) => respuesta({ ordenCodigo: codigo, ordenId: '8',
      totalConforme: '100.0000', totalEmitido: '60.0000', saldoDocumental: '40.0000' });
    await act(async () => {
      root.root.findAllByType('button').find((boton) => boton.children.join('') === 'Reintentar disponibilidad').props.onClick();
    });
    assert.equal(llamadasDisponibilidad().length, 2);
    assert.deepEqual(valoresDisponibilidad(), ['100.0000', '60.0000', '40.0000']);
  });
}

test('ABC-127: una respuesta incompleta se presenta como error, sin rellenar cantidades', async () => {
  respuestaDisponibilidad = (codigo) => respuesta({ ordenCodigo: codigo, ordenId: '8', totalConforme: '100.0000' });
  await montar(); await cambiar('salida-orden', '8');
  assert.match(texto(), /disponibilidad documental incompleta o inválida/);
  assert.deepEqual(valoresDisponibilidad(), []);
});

test('ABC-127: cambiar de orden limpia los datos previos mientras carga y al deseleccionar vuelve al vacío', async () => {
  ordenesDisponibles.push({ id: 9, codigo: 'ORD-SEGUNDA', estado: 'FINALIZADA' });
  await montar(); await cambiar('salida-orden', '8');
  assert.deepEqual(valoresDisponibilidad(), ['100.0000', '60.0000', '40.0000']);
  let resolver;
  respuestaDisponibilidad = () => new Promise((resolve) => { resolver = resolve; });
  await cambiar('salida-orden', '9');
  assert.match(texto(), /Consultando disponibilidad documental/);
  assert.deepEqual(valoresDisponibilidad(), []);
  assert.equal(llamadasDisponibilidad()[1].path, '/api/logistica/disponibilidad/ORD-SEGUNDA');
  await act(async () => resolver(respuesta({ ordenCodigo: 'ORD-SEGUNDA', ordenId: '9',
    totalConforme: '25.0000', totalEmitido: '5.0000', saldoDocumental: '20.0000' })));
  assert.deepEqual(valoresDisponibilidad(), ['25.0000', '5.0000', '20.0000']);
  await cambiar('salida-orden', '');
  assert.deepEqual(valoresDisponibilidad(), []);
  assert.equal(llamadasDisponibilidad().length, 2);
});

test('ABC-127: una respuesta tardía de otra orden no sustituye los datos seleccionados', async () => {
  ordenesDisponibles.push({ id: 9, codigo: 'ORD-SEGUNDA', estado: 'FINALIZADA' });
  let resolverPrimera;
  respuestaDisponibilidad = (codigo) => codigo === orden.codigo
    ? new Promise((resolve) => { resolverPrimera = resolve; })
    : respuesta({ ordenCodigo: codigo, ordenId: '9', totalConforme: '25.0000', totalEmitido: '5.0000', saldoDocumental: '20.0000' });
  await montar(); await cambiar('salida-orden', '8');
  const primera = llamadasDisponibilidad()[0];
  await cambiar('salida-orden', '9');
  assert.equal(primera.signal.aborted, true);
  await act(async () => resolverPrimera(respuesta({ ordenCodigo: orden.codigo, ordenId: '8',
    totalConforme: '100.0000', totalEmitido: '60.0000', saldoDocumental: '40.0000' })));
  assert.deepEqual(valoresDisponibilidad(), ['25.0000', '5.0000', '20.0000']);
});

test('ABC-127: cero conformes es un resultado real válido y muestra un estado vacío informativo', async () => {
  respuestaDisponibilidad = (codigo) => respuesta({ ordenCodigo: codigo, ordenId: '8',
    totalConforme: '0.0000', totalEmitido: '0.0000', saldoDocumental: '0.0000' });
  await montar(); await cambiar('salida-orden', '8');
  assert.deepEqual(valoresDisponibilidad(), ['0.0000', '0.0000', '0.0000']);
  assert.match(texto(), /La orden no tiene unidades conformes registradas/);
});

test('ABC-127: permiso ausente informa cuál se necesita y no cambia las reglas de creación', async () => {
  globalThis.__usuarioLogisticaPrueba.permisos = permisos.filter((codigo) => codigo !== 'logistica.boletas.consultar');
  await montar(); await completar();
  assert.equal(llamadasDisponibilidad().length, 0);
  const aviso = root.root.findByProps({ 'aria-labelledby': 'salida-disponibilidad-titulo' }).findByProps({ role: 'alert' });
  assert.match(aviso.children.join(''), /Necesitas el permiso logistica.boletas.consultar/);
  await enviar();
  assert.equal(solicitudes.length, 1);
});

test('ABC-127: el fallo de disponibilidad no altera el contrato ni bloquea crear una solicitud válida', async () => {
  respuestaDisponibilidad = () => respuesta({ message: 'Servicio no disponible' }, 503);
  await montar(); await completar();
  assert.match(texto(), /HTTP 503: Servicio no disponible/);
  await enviar();
  assert.deepEqual(solicitudes[0].items, [{ referencia: 'LOTE-A', cantidad: '10.0000' }]);
  assert.match(texto(), /registrada en el servidor/);
  assert.deepEqual(valoresDisponibilidad(), []);
});

function cargarSolicitudGuardada(items = [{ referencia: 'LOTE-A', cantidad: '10.0000' }, { referencia: 'LOTE-B', cantidad: '2.0000' }]) {
  solicitudes = [{ id: '27', ordenId: '8', destinoDocumental: 'Destino persistido', motivo: 'Traslado', estado: 'BORRADOR', items }];
}
const filaSolicitud = () => root.root.findByProps({ 'data-solicitud-id': '27' });
const accionBorrador = () => filaSolicitud().findAllByType('button').find((boton) => boton.children.join('') === 'Crear boleta en borrador');
const postsBoleta = () => llamadas.filter((llamada) => llamada.path.endsWith('/boletas') && llamada.method === 'POST');

for (const estado of ['EN_PRODUCCION', 'FINALIZADA']) {
  test(`ABC-75: desde la solicitud guardada con orden ${estado} crea BORRADOR con todos sus ítems y abre el detalle`, async () => {
    cargarSolicitudGuardada();
    respuestaOrden = () => respuesta({ ...orden, estado });
    await montar();
    assert.equal(accionBorrador().props.disabled, false);
    await act(async () => { await accionBorrador().props.onClick(); });
    assert.equal(postsBoleta().length, 1);
    assert.deepEqual(postsBoleta()[0].body, { solicitudSalidaId: '27', items: solicitudes[0].items });
    assert.equal(postsBoleta()[0].headers.Authorization, 'Bearer token-prueba');
    assert.equal(root.root.findByType('output').props['data-ruta'], '/logistica/boletas/11');
    assert.equal(llamadas.some((llamada) => llamada.path.endsWith('/emitir')), false);
    assert.equal(llamadas.some((llamada) => llamada.path.endsWith('/solicitudes-salida') && llamada.method === 'POST'), false);
    assert.match(texto(), /Estado: ","BORRADOR/);
  });
}

test('ABC-75: la solicitud sin ítems no habilita la creación y explica el motivo', async () => {
  cargarSolicitudGuardada([]);
  await montar();
  assert.equal(accionBorrador().props.disabled, true);
  assert.match(texto(), /La solicitud no tiene ítems ni lotes/);
  await act(async () => { await accionBorrador().props.onClick(); });
  assert.equal(postsBoleta().length, 0);
});

test('ABC-75: no descarta silenciosamente un lote inválido para crear una boleta parcial', async () => {
  cargarSolicitudGuardada([{ referencia: 'LOTE-A', cantidad: '10.0000' }, { referencia: 'LOTE-AJENO', cantidad: '2.0000' }]);
  await montar();
  assert.equal(accionBorrador().props.disabled, true);
  assert.match(texto(), /no tiene todos sus lotes válidos/);
  assert.equal(postsBoleta().length, 0);
});

test('ABC-75: sin lotes reales de la orden no habilita crear el borrador', async () => {
  cargarSolicitudGuardada(); respuestaLotes = () => respuesta([]);
  await montar(); assert.equal(accionBorrador().props.disabled, true);
  assert.equal(postsBoleta().length, 0);
});

for (const estado of ['PENDIENTE', 'PLANIFICADA', 'CANCELADA']) {
  test(`ABC-75: orden ${estado} bloquea la acción con la regla confirmada`, async () => {
    cargarSolicitudGuardada(); respuestaOrden = () => respuesta({ ...orden, estado });
    await montar(); assert.equal(accionBorrador().props.disabled, true);
    assert.match(texto(), /Solo EN_PRODUCCION o FINALIZADA permiten preparar la salida/);
    assert.equal(postsBoleta().length, 0);
  });
}

test('ABC-75: cantidades no positivas guardadas bloquean la creación antes de enviar', async () => {
  cargarSolicitudGuardada([{ referencia: 'LOTE-A', cantidad: '0.0000' }]);
  await montar(); assert.equal(accionBorrador().props.disabled, true);
  assert.match(texto(), /referencias o cantidades inválidas/);
  assert.equal(postsBoleta().length, 0);
});

test('ABC-75: doble clic mientras el POST espera envía una sola boleta y no muestra éxito anticipado', async () => {
  cargarSolicitudGuardada();
  let resolver;
  postBoletaRespuesta = () => new Promise((resolve) => { resolver = resolve; });
  await montar();
  const handle = accionBorrador().props.onClick;
  let primero, segundo;
  await act(async () => { primero = handle(); segundo = handle(); });
  assert.equal(postsBoleta().length, 1);
  assert.equal(filaSolicitud().findAllByType('button').find((boton) => boton.children.join('') === 'Creando borrador…').props.disabled, true);
  assert.equal(root.root.findByType('output').props['data-ruta'], '/');
  await act(async () => { resolver(respuesta({ id: '11', estado: 'BORRADOR', solicitudSalidaId: '27' }, 201)); await primero; await segundo; });
  assert.equal(postsBoleta().length, 1);
  assert.equal(root.root.findByType('output').props['data-ruta'], '/logistica/boletas/11');
});

for (const status of [400, 403, 404, 409, 500]) {
  test(`ABC-75: error HTTP ${status} se muestra junto a la solicitud y no crea otra solicitud`, async () => {
    cargarSolicitudGuardada(); postBoletaRespuesta = () => respuesta({ message: `Error de boleta ${status}` }, status);
    await montar(); await act(async () => { await accionBorrador().props.onClick(); });
    assert.match(filaSolicitud().findByProps({ role: 'alert' }).children.join(''), new RegExp(`HTTP ${status}: Error de boleta ${status}`));
    assert.equal(solicitudes.length, 1);
    assert.equal(root.root.findByType('output').props['data-ruta'], '/');
    assert.equal(llamadas.some((llamada) => llamada.path.endsWith('/solicitudes-salida') && llamada.method === 'POST'), false);
  });
}

test('ABC-75: sin permiso gestionar boletas informa el faltante y no consulta orden o lotes de la fila', async () => {
  cargarSolicitudGuardada(); globalThis.__usuarioLogisticaPrueba.permisos = ['logistica.solicitudes.consultar'];
  await montar(); assert.equal(accionBorrador().props.disabled, true);
  assert.match(texto(), /logistica.boletas.gestionar/);
  assert.equal(llamadas.length, 1);
});

test('ABC-75: revalida la orden antes del POST e impide crear si fue cancelada después de cargar', async () => {
  cargarSolicitudGuardada(); await montar();
  respuestaOrden = () => respuesta({ ...orden, estado: 'CANCELADA' });
  await act(async () => { await accionBorrador().props.onClick(); });
  assert.equal(postsBoleta().length, 0); assert.equal(accionBorrador().props.disabled, true);
  assert.match(filaSolicitud().findByProps({ role: 'alert' }).children.join(''), /CANCELADA/);
});

test('ABC-75: fallo consultando orden se muestra como error y permite verificar otra vez', async () => {
  cargarSolicitudGuardada(); respuestaOrden = () => respuesta({ message: 'Orden no encontrada' }, 404);
  await montar(); assert.equal(accionBorrador().props.disabled, true);
  assert.match(texto(), /HTTP 404: Orden no encontrada/);
  respuestaOrden = () => respuesta(orden);
  await act(async () => { filaSolicitud().findAllByType('button').find((boton) => boton.children.join('') === 'Reintentar validación').props.onClick(); });
  assert.equal(accionBorrador().props.disabled, false);
});
