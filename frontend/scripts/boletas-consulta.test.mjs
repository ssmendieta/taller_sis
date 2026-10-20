import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const originales = Object.fromEntries(['fetch', 'document', 'sessionStorage', 'localStorage'].map((key) => [key, globalThis[key]]));
const respuesta = (body, status = 200) => new Response(JSON.stringify(body), { status });
const ordenes = { '7': 'ORD-2026-00007', '8': 'ORD-2026-00008' };
let vite, AppRoutes, Pagina, servicio, root, datos, llamadas, errorHttp, errorOrden;

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-consulta-prueba', enforce: 'pre', transform(_codigo, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
        return 'export function useSesion() { return { usuario: globalThis.__usuarioConsultaPrueba }; }';
      }
    } }],
  });
  ({ default: AppRoutes } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/BoletasPage.jsx'));
  servicio = await vite.ssrLoadModule('/src/services/boletasService.js');
});

beforeEach(() => {
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem(key) {
    assert.equal(key, 'accessToken', 'Solo se puede leer el token; los documentos proceden de HTTP');
    return 'token-prueba';
  }, setItem() { throw new Error('No se permite almacenar boletas en el navegador'); },
  get length() { throw new Error('No se permite enumerar boletas del navegador'); } };
  globalThis.localStorage = { getItem() { throw new Error('El token ya está disponible en la sesión'); },
    setItem() { throw new Error('No se permite almacenar boletas en el navegador'); } };
  globalThis.__usuarioConsultaPrueba = { id: '42', rol: 'Encargado de Logística',
    permisos: ['logistica.boletas.consultar', 'ordenes.consultar'] };
  datos = Array.from({ length: 14 }, (_, index) => ({ id: String(index + 1), numero: `BOL-PRUEBA-${index + 1}`,
    estado: ['BORRADOR', 'EMITIDA', 'ANULADA'][index % 3], creadoEn: '2026-10-19T12:00:00Z',
    solicitudSalidaId: String(index + 1), solicitudSalida: { ordenId: index < 8 ? '7' : '8' }, items: [] }));
  llamadas = []; errorHttp = 0; errorOrden = false;
  globalThis.fetch = async (url, opciones = {}) => {
    const parsed = new URL(url);
    llamadas.push({ url: parsed, headers: opciones.headers, method: opciones.method || 'GET' });
    if (parsed.pathname.endsWith('/boletas')) {
      if (errorHttp) return respuesta({ message: `Error real ${errorHttp}` }, errorHttp);
      const filtros = parsed.searchParams;
      const items = datos.filter((boleta) => (!filtros.get('orden') || ordenes[boleta.solicitudSalida.ordenId] === filtros.get('orden'))
        && (!filtros.get('estado') || boleta.estado === filtros.get('estado')));
      const page = Number(filtros.get('page') || 1);
      const limit = Number(filtros.get('limit') || 10);
      return respuesta({ items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit,
        totalPages: Math.ceil(items.length / limit) });
    }
    const match = /\/ordenes\/(\d+)$/.exec(parsed.pathname);
    if (match) return errorOrden ? respuesta({ message: 'Sin permiso de Producción' }, 403)
      : respuesta({ id: match[1], codigo: ordenes[match[1]] });
    throw new Error(`Petición inesperada: ${url}`);
  };
});

afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => {
  await vite?.close();
  for (const [key, valor] of Object.entries(originales)) {
    if (valor === undefined) delete globalThis[key]; else globalThis[key] = valor;
  }
  delete globalThis.__usuarioConsultaPrueba;
});

async function montar(ruta = '/logistica/boletas', Componente = AppRoutes) {
  await act(async () => { root = Renderer.create(React.createElement(MemoryRouter,
    { initialEntries: [ruta], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Componente))); });
}
const listado = () => llamadas.filter((llamada) => llamada.url.pathname.endsWith('/boletas'));
const ultimaConsulta = () => listado().at(-1).url.searchParams;
const filas = () => root.root.findAllByType('tbody').flatMap((body) => body.findAllByType('tr'));
const texto = () => JSON.stringify(root.toJSON());
async function cambiar(id, value) { await act(async () => root.root.findByProps({ id }).props.onChange({ target: { value } })); }
async function aplicar() { await act(async () => { await root.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); }
async function pulsar(nombre) {
  await act(async () => {
    const boton = root.root.findAllByType('button').find((elemento) => elemento.children.join('') === nombre);
    assert.ok(boton, `Debe existir el botón ${nombre}`);
    assert.equal(!!boton.props.disabled, false);
    await boton.props.onClick();
  });
}

test('servicio: serializa solo orden, estado, page y limit y conserva Bearer', async () => {
  await servicio.listarBoletas({ orden: ' ORD / 7? ', estado: 'EMITIDA', page: 2, limit: 5, inventado: 'no' });
  assert.deepEqual(Object.fromEntries(ultimaConsulta()), { orden: 'ORD / 7?', estado: 'EMITIDA', page: '2', limit: '5' });
  assert.equal(listado()[0].headers.Authorization, 'Bearer token-prueba');
  assert.equal(listado()[0].method, 'GET');
});

test('servicio: sin filtros conserva la URL sin query y omite valores vacíos', async () => {
  await servicio.listarBoletas();
  assert.equal(listado()[0].url.search, '');
  await servicio.listarBoletas({ orden: '   ', estado: '', page: undefined, limit: null });
  assert.equal(listado()[1].url.search, '');
});

test('la navegación real abre Boletas con datos HTTP y muestra total, orden y estado', async () => {
  await montar();
  assert.equal(filas().length, 10);
  assert.match(texto(), /ORD-2026-00007/);
  assert.match(texto(), /Emitida/);
  assert.match(texto(), /14 boletas/);
  assert.ok(root.root.findAllByType('a').some((enlace) => enlace.props.href === '/logistica/boletas'));
  assert.ok(root.root.findAllByType('a').some((enlace) => enlace.props.href === '/logistica/boletas/1'));
  assert.equal(ultimaConsulta().get('page'), '1');
});

test('buscar código de orden devuelve únicamente sus boletas al aplicar', async () => {
  await montar();
  await cambiar('boletas-orden', ' ORD-2026-00007 ');
  assert.equal(listado().length, 1, 'Escribir no aplica un filtro parcial en el navegador');
  await aplicar();
  assert.equal(ultimaConsulta().get('orden'), 'ORD-2026-00007');
  assert.equal(filas().length, 8);
  for (const fila of filas()) assert.equal(fila.findAllByType('td')[1].children.join(''), 'ORD-2026-00007');
});

test('combina orden y estado en la misma consulta al servidor', async () => {
  await montar(); await cambiar('boletas-orden', 'ORD-2026-00007'); await cambiar('boletas-estado', 'EMITIDA'); await aplicar();
  assert.equal(ultimaConsulta().get('orden'), 'ORD-2026-00007');
  assert.equal(ultimaConsulta().get('estado'), 'EMITIDA');
  assert.equal(filas().length, 3);
  for (const fila of filas()) {
    assert.equal(fila.findAllByType('td')[1].children.join(''), 'ORD-2026-00007');
    assert.equal(fila.findByType('span').children.join(''), 'Emitida');
  }
});

test('limpiar restaura todos los resultados consultando nuevamente la página 1', async () => {
  await montar(); await cambiar('boletas-orden', 'ORD-2026-00007'); await cambiar('boletas-estado', 'ANULADA'); await aplicar();
  await pulsar('Limpiar filtros');
  assert.deepEqual(Object.fromEntries(ultimaConsulta()), { page: '1', limit: '10' });
  assert.equal(root.root.findByProps({ id: 'boletas-orden' }).props.value, '');
  assert.equal(root.root.findByProps({ id: 'boletas-estado' }).props.value, '');
  assert.equal(filas().length, 10); assert.match(texto(), /14 boletas/);
});

test('orden inexistente: cero resultados y navegación deshabilitada', async () => {
  await montar(); await cambiar('boletas-orden', 'ORD-INEXISTENTE'); await aplicar();
  assert.equal(filas().length, 0); assert.match(texto(), /No se encontraron boletas/);
  const nav = root.root.findByProps({ 'aria-label': 'Paginación de boletas' });
  assert.ok(nav.findAllByType('button').every((boton) => boton.props.disabled));
  assert.equal(ultimaConsulta().get('orden'), 'ORD-INEXISTENTE');
});

test('paginación remota conserva filtros aplicados aunque se edite el formulario', async () => {
  await montar(); await cambiar('boletas-orden', 'ORD-2026-00007'); await cambiar('boletas-limite', '5'); await aplicar();
  assert.equal(filas().length, 5);
  await cambiar('boletas-orden', 'ORD-2026-00008');
  await pulsar('Siguiente');
  assert.deepEqual(Object.fromEntries(ultimaConsulta()), { orden: 'ORD-2026-00007', page: '2', limit: '5' });
  assert.equal(filas().length, 3);
  const nav = root.root.findByProps({ 'aria-label': 'Paginación de boletas' });
  assert.equal(nav.findAllByType('button')[1].props.disabled, true);
  await pulsar('Anterior');
  assert.equal(ultimaConsulta().get('page'), '1'); assert.equal(filas().length, 5);
  await aplicar(); assert.equal(ultimaConsulta().get('page'), '1');
  assert.equal(ultimaConsulta().get('orden'), 'ORD-2026-00008');
});

test('la antigua ruta de consulta también usa la API y conserva los filtros funcionales', async () => {
  await montar('/logistica/boletas/consulta');
  await cambiar('boletas-orden', 'ORD-2026-00008'); await aplicar();
  assert.equal(filas().length, 6); assert.equal(ultimaConsulta().get('orden'), 'ORD-2026-00008');
});

for (const ruta of ['/logistica/boletas', '/logistica/boletas/consulta']) {
  test(`${ruta}: sin permiso consultar no muestra la página ni hace peticiones`, async () => {
    globalThis.__usuarioConsultaPrueba.permisos = ['logistica.boletas.gestionar'];
    await montar(ruta); assert.match(texto(), /Acceso denegado/); assert.equal(llamadas.length, 0);
  });
}

test('el componente también evita consultar sin permiso aunque se monte directamente', async () => {
  globalThis.__usuarioConsultaPrueba.permisos = [];
  await montar('/', Pagina); assert.match(texto(), /No tienes permiso/); assert.equal(llamadas.length, 0);
});

test('solo lectura de boletas funciona sin consultar nombres de órdenes sin permiso', async () => {
  globalThis.__usuarioConsultaPrueba.permisos = ['logistica.boletas.consultar'];
  await montar(); assert.equal(llamadas.length, 1); assert.match(texto(), /Orden #7/);
});

test('fallo en el nombre de la orden conserva boletas e identifica su orden por ID', async () => {
  errorOrden = true;
  await montar(); assert.equal(filas().length, 10); assert.match(texto(), /Orden #7/);
});

for (const status of [401, 403, 500]) {
  test(`HTTP ${status}: muestra el error y permite reintentar con los mismos filtros`, async () => {
    await montar(); await cambiar('boletas-orden', 'ORD-2026-00007'); errorHttp = status; await aplicar();
    assert.equal(filas().length, 0);
    assert.match(texto(), status === 403 ? /No tienes permiso/ : status === 401 ? /Tu sesión expiró/ : /Error real 500/);
    errorHttp = 0; await pulsar('Reintentar');
    assert.equal(ultimaConsulta().get('orden'), 'ORD-2026-00007'); assert.equal(filas().length, 8);
  });
}
