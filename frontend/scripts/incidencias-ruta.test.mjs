import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createServer } from 'vite';

// PRUEBA SIMULADA (ABC-382): la API de Logística es un fetch en memoria que sigue
// el contrato propuesto para ABC-381 (services/logistica-service/src/incidencias/README.md).
// La página, sus componentes y el servicio se cargan sin modificar.
let vite, Pagina, root, llamadas, ruta, historial, respuestaPost, retenerPost, historialNoExiste;
const originales = Object.fromEntries(['fetch', 'document', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const GESTION = ['logistica.rutas.consultar', 'logistica.rutas.gestionar'];

function dia(desplazamiento) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + desplazamiento);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}
const ddmmaaaa = (iso) => iso.split('-').reverse().join('/');
const PROGRAMADA = dia(2);
const ORIGINAL = dia(1);

function rutaInicial(estado = 'PLANIFICADA') {
  return {
    id: '9', fechaProgramada: PROGRAMADA, vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12', estado,
    despachadaEn: null, despachadaPorUsuarioId: null, despachoObservacion: null, completadaEn: null,
    paradas: [
      { id: '10', rutaId: '9', secuencia: 1, destino: 'Tienda Central', estadoEntrega: 'PENDIENTE', boletas: [{ id: 'd1', boletaId: '1' }] },
      { id: '11', rutaId: '9', secuencia: 2, destino: 'Sucursal Norte', estadoEntrega: 'PENDIENTE', boletas: [{ id: 'd3', boletaId: '3' }] },
    ],
  };
}

function historialInicial() {
  return {
    rutaId: '9', fechaOriginal: ORIGINAL, fechaProgramada: PROGRAMADA,
    incidencias: [{ id: '3', rutaId: '9', paradaId: '11', tipo: 'CLIENTE_AUSENTE', motivo: 'Local cerrado', registradaPorUsuarioId: '7', registradaEn: '2026-11-06T19:20:00.000Z' }],
    reprogramaciones: [{ id: '1', rutaId: '9', incidenciaId: '3', fechaAnterior: ORIGINAL, fechaNueva: PROGRAMADA, motivo: 'Local cerrado', registradaPorUsuarioId: '7', registradaEn: '2026-11-06T19:20:00.000Z' }],
  };
}

// Reglas del contrato: tipo y motivo, parada de la ruta y reprogramación en el mismo paso.
function registrar(cuerpo) {
  const id = String(10 + historial.incidencias.length);
  historial.incidencias.push({ id, rutaId: '9', paradaId: cuerpo.paradaId, tipo: cuerpo.tipo, motivo: cuerpo.motivo, registradaPorUsuarioId: '42', registradaEn: '2026-11-06T20:00:00.000Z' });
  if (cuerpo.nuevaFecha) {
    historial.reprogramaciones.push({ id: String(historial.reprogramaciones.length + 1), rutaId: '9', incidenciaId: id, fechaAnterior: historial.fechaProgramada, fechaNueva: cuerpo.nuevaFecha, motivo: cuerpo.motivo, registradaPorUsuarioId: '42', registradaEn: '2026-11-06T20:00:00.000Z' });
    historial.fechaProgramada = cuerpo.nuevaFecha;
    ruta.fechaProgramada = cuerpo.nuevaFecha;
  }
  return json(historial, 201);
}

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-incidencias-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) return 'export function useSesion(){return {usuario: globalThis.__usuarioIncidencias};}';
    } }] });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/RutaDetallePage.jsx'));
});

beforeEach(() => {
  llamadas = [];
  ruta = rutaInicial();
  historial = historialInicial();
  respuestaPost = null;
  retenerPost = null;
  historialNoExiste = false;
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__usuarioIncidencias = { id: '42', permisos: GESTION };
  globalThis.fetch = async (url, opciones = {}) => {
    const path = new URL(url).pathname;
    const metodo = opciones.method || 'GET';
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
    llamadas.push({ path, metodo, cuerpo, auth: opciones.headers?.Authorization });
    if (path === '/api/logistica/rutas/9' && metodo === 'GET') return json(ruta);
    if (path === '/api/logistica/rutas/9/incidencias' && metodo === 'GET') {
      return historialNoExiste ? json({ message: 'Cannot GET /rutas/9/incidencias' }, 404) : json(historial);
    }
    if (path === '/api/logistica/rutas/9/incidencias' && metodo === 'POST') {
      if (retenerPost) await retenerPost;
      return respuestaPost ? respuestaPost(cuerpo) : registrar(cuerpo);
    }
    throw new Error(`Petición inesperada: ${metodo} ${path}`);
  };
});

afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); delete globalThis.__usuarioIncidencias; });

async function montar() {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, { initialEntries: ['/logistica/rutas/9'] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/logistica/rutas/:id', element: React.createElement(Pagina) }))));
  });
}

function textoDe(nodo) {
  if (nodo == null) return '';
  if (typeof nodo === 'string') return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join('');
  return textoDe(nodo.children);
}
const texto = () => textoDe(root.toJSON());
const campo = (id) => root.root.find((n) => typeof n.type === 'string' && n.props.id === id);
const formulario = () => root.root.find((n) => n.type === 'form' && n.props['aria-label'] === 'Registrar incidencia');
const posts = () => llamadas.filter((l) => l.metodo === 'POST');
const evento = { preventDefault() {} };
const tablas = () => root.root.findAll((n) => n.type === 'table').map((tabla) => tabla.findAll((n) => n.type === 'tr').map((fila) => textoDe(fila.children)));

async function cambiar(id, valor) {
  await act(async () => campo(id).props.onChange({ target: { value: valor, checked: valor } }));
}
async function enviar() {
  await act(async () => { await formulario().props.onSubmit(evento); });
}
async function completar({ tipo = 'AVERIA_VEHICULO', parada = '', motivo = '  Falla de frenos  ', fecha = null } = {}) {
  await cambiar('incidencia-tipo', tipo);
  await cambiar('incidencia-parada', parada);
  await cambiar('incidencia-motivo', motivo);
  if (fecha) {
    await cambiar('incidencia-reprogramar', true);
    await cambiar('incidencia-fecha', fecha);
  }
}

test('muestra el historial de la ruta: fecha original y actual, reprogramaciones e incidencias', async () => {
  await montar();
  const pagina = texto();
  assert.match(pagina, new RegExp(`Fecha original${ddmmaaaa(ORIGINAL)}`));
  assert.match(pagina, new RegExp(`Fecha programada actual${ddmmaaaa(PROGRAMADA)} · 1 reprogramación`));
  assert.match(pagina, /1 incidencias · 1 reprogramaciones/);
  const [, cambios, incidencias] = tablas();
  assert.equal(cambios[1], `06/11/2026 15:20${ddmmaaaa(ORIGINAL)} → ${ddmmaaaa(PROGRAMADA)}Local cerradoCliente ausenteusuario #7`);
  assert.equal(incidencias[1], '06/11/2026 15:20Cliente ausenteParada 2 · Sucursal NorteLocal cerradousuario #7');
  assert.equal(llamadas.find((l) => l.path.endsWith('/incidencias')).auth, 'Bearer token-prueba');
});

test('registra una incidencia de una entrega sin reprogramar y limpia el formulario', async () => {
  await montar();
  await completar({ tipo: 'CARGA_DANADA', parada: '10', motivo: '  Caja aplastada ' });
  await enviar();
  assert.deepEqual(posts().map((p) => p.cuerpo), [{ tipo: 'CARGA_DANADA', motivo: 'Caja aplastada', paradaId: '10', nuevaFecha: null }]);
  assert.match(texto(), /Incidencia registrada\./);
  assert.match(texto(), /2 incidencias · 1 reprogramaciones/);
  assert.equal(tablas()[2][2], '06/11/2026 16:00Carga dañadaParada 1 · Tienda CentralCaja aplastadausuario #42');
  assert.equal(campo('incidencia-motivo').props.value, '');
  assert.equal(campo('incidencia-tipo').props.value, '');
});

test('registra y reprograma: actualiza la fecha de la ruta y el historial conserva la original', async () => {
  const nueva = dia(5);
  await montar();
  await completar({ fecha: nueva });
  assert.equal(root.root.findAll((n) => n.type === 'button' && textoDe(n.children) === 'Registrar y reprogramar').length, 1);
  await enviar();
  assert.deepEqual(posts()[0].cuerpo, { tipo: 'AVERIA_VEHICULO', motivo: 'Falla de frenos', paradaId: null, nuevaFecha: nueva });
  const pagina = texto();
  assert.match(pagina, new RegExp(`Incidencia registrada y ruta reprogramada al ${ddmmaaaa(nueva)}`));
  assert.match(pagina, new RegExp(`Fecha programada${nueva}`), 'los datos generales muestran la nueva fecha');
  assert.match(pagina, new RegExp(`Fecha original${ddmmaaaa(ORIGINAL)}`));
  assert.equal(tablas()[1][2], `06/11/2026 16:00${ddmmaaaa(PROGRAMADA)} → ${ddmmaaaa(nueva)}Falla de frenosAvería del vehículousuario #42`);
});

test('valida en el formulario sin llamar a la API', async () => {
  await montar();
  await enviar();
  assert.match(texto(), /Elige el tipo de incidencia\./);
  await cambiar('incidencia-tipo', 'RETRASO');
  await cambiar('incidencia-motivo', '   ');
  await enviar();
  assert.match(texto(), /Escribe el motivo de la incidencia\./);
  await cambiar('incidencia-motivo', 'Tráfico');
  for (const [fecha, mensaje] of [
    ['', /Elige la nueva fecha de entrega\./],
    [dia(0), /debe ser posterior a hoy/],
    [dia(-3), /debe ser posterior a hoy/],
    [PROGRAMADA, /igual a la fecha programada actual/],
  ]) {
    await cambiar('incidencia-reprogramar', true);
    await cambiar('incidencia-fecha', fecha);
    await enviar();
    assert.match(texto(), mensaje);
  }
  assert.equal(posts().length, 0);
});

test('conflicto de recursos: muestra cada recurso y conserva lo escrito', async () => {
  const nueva = dia(4);
  respuestaPost = () => json({
    statusCode: 409, codigo: 'CONFLICTO_RECURSOS', message: `El vehículo o el chofer no están disponibles el ${nueva}`,
    conflictos: [
      { recurso: 'VEHICULO', idExterno: 'VEH-01', motivo: 'Asignado a la ruta 12' },
      { recurso: 'CHOFER', idExterno: 'CHO-12', motivo: 'No disponible en el ERP' },
    ],
  }, 409);
  await montar();
  await completar({ tipo: 'RETRASO', parada: '11', motivo: 'Camión retenido', fecha: nueva });
  await enviar();
  const pagina = texto();
  assert.match(pagina, new RegExp(`El vehículo o el chofer no están disponibles el ${nueva}`));
  assert.match(pagina, /Vehículo VEH-01: Asignado a la ruta 12/);
  assert.match(pagina, /Chofer CHO-12: No disponible en el ERP/);
  assert.deepEqual(
    ['incidencia-tipo', 'incidencia-parada', 'incidencia-motivo', 'incidencia-fecha'].map((id) => campo(id).props.value),
    ['RETRASO', '11', 'Camión retenido', nueva],
  );
  assert.equal(campo('incidencia-reprogramar').props.checked, true);
  assert.match(texto(), /1 incidencias · 1 reprogramaciones/, 'el historial no cambia');
});

test('otros errores del servidor también conservan el formulario', async () => {
  respuestaPost = () => json({ statusCode: 409, message: 'No se puede reprogramar una ruta COMPLETADA' }, 409);
  await montar();
  await completar({ motivo: 'Reintento', fecha: dia(3) });
  await enviar();
  assert.match(texto(), /No se puede reprogramar una ruta COMPLETADA/);
  assert.equal(campo('incidencia-motivo').props.value, 'Reintento');
});

test('un segundo envío mientras se registra no repite la petición', async () => {
  let liberar;
  retenerPost = new Promise((resolver) => { liberar = resolver; });
  await montar();
  await completar();
  let primero;
  act(() => { primero = formulario().props.onSubmit(evento); formulario().props.onSubmit(evento); });
  assert.equal(root.root.find((n) => n.type === 'button' && textoDe(n.children) === 'Registrando…').props.disabled, true);
  await act(async () => { liberar(); await primero; });
  assert.equal(posts().length, 1);
});

for (const estado of ['COMPLETADA', 'CANCELADA']) {
  test(`una ruta ${estado} registra incidencias pero no ofrece reprogramar`, async () => {
    ruta = rutaInicial(estado);
    await montar();
    assert.equal(root.root.findAll((n) => n.props?.id === 'incidencia-reprogramar').length, 0);
    assert.match(texto(), new RegExp(`Una ruta ${estado === 'COMPLETADA' ? 'completada' : 'cancelada'} no se puede reprogramar`));
    await completar({ tipo: 'OTRO', motivo: 'Reclamo posterior' });
    await enviar();
    assert.equal(posts()[0].cuerpo.nuevaFecha, null);
  });
}

test('con solo permiso de consulta ve el historial pero no el formulario', async () => {
  globalThis.__usuarioIncidencias = { id: '5', permisos: ['logistica.rutas.consultar'] };
  await montar();
  assert.equal(root.root.findAll((n) => n.type === 'form').length, 0);
  assert.match(texto(), /Cliente ausente/);
});

test('si el servidor aún no tiene el historial lo indica sin romper la página', async () => {
  historialNoExiste = true;
  await montar();
  assert.match(texto(), /El historial de incidencias todavía no está disponible en el servidor\./);
  assert.match(texto(), /Paradas y entregas/);
});
