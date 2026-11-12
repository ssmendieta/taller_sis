import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// PRUEBA SIMULADA (ABC-372): la API de Logística, el ERP y Producción son un fetch
// en memoria que sigue el contrato de services/logistica-service/src/rutas/README.md.
// No hay ERP, Producción ni mensajería reales. La página, sus componentes y el
// servicio se cargan sin modificar.
let vite, Pagina, AppRoutes, root, llamadas, rutas, respuestaPost, respuestaRecursos;
const originales = Object.fromEntries(['fetch', 'document', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const GESTION = ['logistica.rutas.consultar', 'logistica.rutas.gestionar', 'logistica.boletas.consultar'];

function dia(desplazamiento) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + desplazamiento);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}
const PROGRAMADA = dia(3);
const GRUPO = { id: '5', destino: 'Tienda Central', fechaRequerida: PROGRAMADA, tipoCarga: 'PESADA', unidadCarga: 'kg', solicitudIds: ['1'], despachado: false };
const BOLETAS = ['1', '2', '3'].map((id) => ({ id, numero: `BOL-00${id}`, estado: 'EMITIDA', productoCodigo: 'PAN-01', unidad: 'kg' }));

function recursosDe(fecha, origen = 'ERP') {
  return {
    fecha, origen, sincronizadoEn: '2026-11-06T19:20:00.000Z', generadoEn: '2026-11-06T19:19:00.000Z',
    vehiculos: [
      { idExterno: 'VEH-01', placa: '1234-ABC', descripcion: 'Camión', capacidad: { valor: '2000', unidad: 'kg' }, disponible: true },
      { idExterno: 'VEH-02', placa: '5678-XYZ', descripcion: null, capacidad: { valor: '500', unidad: 'kg' }, disponible: false },
    ],
    choferes: [{ idExterno: 'CHO-12', nombre: 'Luis Rojas', licenciaCategoria: 'C', disponible: true }],
    totales: { vehiculos: 2, choferes: 1 },
    aviso: origen === 'RESPALDO' ? { mensaje: 'El ERP no respondió.' } : null,
  };
}

function rutaGuardada(id, estado = 'PLANIFICADA') {
  return {
    id, grupoId: '5', fechaProgramada: PROGRAMADA, vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12', estado,
    paradas: [{ id: '10', rutaId: id, secuencia: 1, destino: 'Tienda Central', estadoEntrega: 'PENDIENTE', boletas: [{ id: 'd1', boletaId: '3' }] }],
  };
}

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'sesion-rutas-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) return 'export function useSesion(){return {usuario: globalThis.__usuarioRutas};}';
    } }] });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/RutasPage.jsx'));
  ({ default: AppRoutes } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
});

beforeEach(() => {
  llamadas = [];
  rutas = [rutaGuardada('9')];
  respuestaPost = null;
  respuestaRecursos = null;
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__usuarioRutas = { id: '42', permisos: GESTION.map((codigo) => ({ codigo })) };
  globalThis.fetch = async (url, opciones = {}) => {
    const { pathname: path, searchParams } = new URL(url);
    const metodo = opciones.method || 'GET';
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
    llamadas.push({ path, metodo, cuerpo, auth: opciones.headers?.Authorization });
    if (path === '/api/logistica/rutas' && metodo === 'GET') return json(rutas);
    if (path === '/api/logistica/agrupaciones' && metodo === 'GET') return json([GRUPO]);
    if (path === '/api/logistica/rutas/boletas-disponibles' && metodo === 'GET') {
      // Contrato de ABC-372: EMITIDAS sin ruta activa; con rutaId se suman las de esa ruta.
      const propia = searchParams.get('rutaId');
      const ocupadas = new Set(rutas.filter((r) => ['PLANIFICADA', 'DESPACHADA'].includes(r.estado) && r.id !== propia)
        .flatMap((r) => r.paradas.flatMap((p) => p.boletas.map((b) => b.boletaId))));
      return json(BOLETAS.filter((boleta) => !ocupadas.has(boleta.id)));
    }
    if (path === '/api/logistica/recursos-logisticos') {
      return respuestaRecursos ? respuestaRecursos(searchParams.get('fecha')) : json(recursosDe(searchParams.get('fecha')));
    }
    if (path === '/api/logistica/rutas' && metodo === 'POST') {
      if (respuestaPost) return respuestaPost(cuerpo);
      const creada = { ...rutaGuardada('10'), ...cuerpo, estado: 'PLANIFICADA', paradas: cuerpo.paradas.map((p, i) => ({ id: `n${i}`, secuencia: i + 1, destino: p.destino, boletas: p.boletaIds.map((b) => ({ boletaId: b })) })) };
      rutas.push(creada);
      return json(creada, 201);
    }
    if (/^\/api\/logistica\/rutas\/\d+$/.test(path) && metodo === 'PUT') {
      if (respuestaPost) return respuestaPost(cuerpo);
      const id = path.split('/').pop();
      const editada = { ...rutaGuardada(id), fechaProgramada: cuerpo.fechaProgramada, vehiculoExternoId: cuerpo.vehiculoExternoId, choferExternoId: cuerpo.choferExternoId, paradas: cuerpo.paradas.map((p, i) => ({ id: `e${i}`, secuencia: i + 1, destino: p.destino, boletas: p.boletaIds.map((b) => ({ boletaId: b })) })) };
      rutas = rutas.map((ruta) => (ruta.id === id ? editada : ruta));
      return json(editada);
    }
    throw new Error(`Petición inesperada: ${metodo} ${path}`);
  };
});

afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(async () => { await vite?.close(); Object.assign(globalThis, originales); delete globalThis.__usuarioRutas; });

async function montar(Componente = Pagina, ruta = '/logistica/planificacion') {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, { initialEntries: [ruta], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      React.createElement(Componente)));
  });
}

function textoDe(nodo) {
  if (nodo == null) return '';
  if (typeof nodo === 'string') return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join('');
  return textoDe(nodo.children);
}
const texto = () => textoDe(root.toJSON());
const evento = { preventDefault() {} };
const campo = (id) => root.root.find((n) => typeof n.type === 'string' && n.props.id === id);
const conAria = (etiqueta) => root.root.find((n) => typeof n.type === 'string' && n.props['aria-label'] === etiqueta);
const formulario = () => conAria('Planificar ruta');
const posts = () => llamadas.filter((l) => l.metodo === 'POST');
const puts = () => llamadas.filter((l) => l.metodo === 'PUT');
const checkboxBoleta = (boletaId, parada = 1) => root.root.find((n) => n.type === 'input' && n.props.type === 'checkbox'
  && new RegExp(`^parada-p\\d+-boleta-${boletaId}$`).test(n.props.id) && n.props.id.startsWith(`parada-${paradaClave(parada)}-`));
const paradaClave = (indice) => {
  const destinos = root.root.findAll((n) => n.type === 'input' && /^parada-destino-p\d+$/.test(n.props.id ?? ''));
  return destinos[indice - 1].props.id.replace('parada-destino-', '');
};

async function cambiar(id, valor) { await act(async () => campo(id).props.onChange({ target: { value: valor } })); }
async function alternarBoleta(boletaId, parada = 1) { await act(async () => checkboxBoleta(boletaId, parada).props.onChange()); }
async function elegir(etiqueta) { await act(async () => conAria(etiqueta).props.onChange()); }
async function pulsar(etiqueta) { await act(async () => conAria(etiqueta).props.onClick()); }
async function guardar() { await act(async () => { await formulario().props.onSubmit(evento); }); }
async function completarRuta() {
  await cambiar('ruta-grupo', '5');
  await alternarBoleta('1');
  await elegir('Elegir vehículo VEH-01');
  await elegir('Elegir chofer CHO-12');
}

test('planifica una ruta completa con grupo, fecha, parada, boletas, vehículo y chofer', async () => {
  await montar();
  assert.match(texto(), /Rutas/);
  assert.match(texto(), /#9/);
  await completarRuta();
  assert.equal(campo('ruta-fecha').props.value, PROGRAMADA, 'el grupo precarga su fecha');
  assert.equal(campo(`parada-destino-${paradaClave(1)}`).props.value, 'Tienda Central', 'el grupo precarga su destino');
  assert.match(texto(), /VEH-01 · 1234-ABC · capacidad/);
  await guardar();
  assert.equal(posts().length, 1);
  assert.deepEqual(posts()[0].cuerpo, {
    grupoId: '5', fechaProgramada: PROGRAMADA, vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12',
    paradas: [{ destino: 'Tienda Central', boletaIds: ['1'] }],
  });
  assert.equal(posts()[0].auth, 'Bearer token-prueba');
  assert.match(texto(), /Ruta #10 guardada como planificada/);
  assert.match(texto(), /#10/, 'la lista se recarga con la ruta nueva');
  assert.equal(campo('ruta-fecha').props.value, '', 'tras guardar el formulario queda limpio');
});

test('un 409 de recursos muestra el motivo y conserva todos los datos válidos', async () => {
  respuestaPost = () => json({ statusCode: 409, codigo: 'CONFLICTO_RECURSOS', message: 'Hay recursos no disponibles para la fecha.',
    conflictos: [{ recurso: 'VEHICULO', idExterno: 'VEH-01', motivo: 'Ya asignado a la ruta 4' }] }, 409);
  await montar();
  await completarRuta();
  await guardar();
  assert.equal(posts().length, 1);
  assert.match(texto(), /Hay recursos no disponibles para la fecha\./);
  assert.match(texto(), /Vehículo VEH-01: Ya asignado a la ruta 4/);
  assert.equal(campo('ruta-fecha').props.value, PROGRAMADA);
  assert.equal(campo('ruta-grupo').props.value, '5');
  assert.equal(campo(`parada-destino-${paradaClave(1)}`).props.value, 'Tienda Central');
  assert.equal(checkboxBoleta('1').props.checked, true);
  assert.equal(conAria('Elegir vehículo VEH-01').props.checked, true);
  assert.equal(conAria('Elegir chofer CHO-12').props.checked, true);
  assert.equal(rutas.length, 1, 'no se creó ninguna ruta');
});

test('el rechazo por sobrecarga se muestra y permite corregir sin reescribir', async () => {
  respuestaPost = () => json({ statusCode: 409, message: 'Sobrecarga: la carga de 2500 kg supera la capacidad de 2000 kg.' }, 409);
  await montar();
  await completarRuta();
  await guardar();
  assert.match(texto(), /Sobrecarga: la carga de 2500 kg supera la capacidad de 2000 kg\./);
  assert.equal(checkboxBoleta('1').props.checked, true);
  await alternarBoleta('1');
  respuestaPost = null;
  await alternarBoleta('2');
  await guardar();
  assert.equal(posts().length, 2);
  assert.deepEqual(posts()[1].cuerpo.paradas, [{ destino: 'Tienda Central', boletaIds: ['2'] }]);
  assert.match(texto(), /Ruta #10 guardada/);
});

test('la validación del formulario no llama a la red y conserva lo escrito', async () => {
  await montar();
  await guardar();
  assert.match(texto(), /Elige la fecha programada de la ruta\./);
  await cambiar('ruta-fecha', PROGRAMADA);
  await guardar();
  assert.match(texto(), /Elige un vehículo disponible/);
  await elegir('Elegir vehículo VEH-01');
  await elegir('Elegir chofer CHO-12');
  await guardar();
  assert.match(texto(), /Agrega al menos una parada\./);
  await act(async () => conAria('Planificar ruta').findAll((n) => n.type === 'button' && textoDe(n.children) === 'Agregar parada')[0].props.onClick());
  await guardar();
  assert.match(texto(), /Indica el destino de la parada 1\./);
  await cambiar(`parada-destino-${paradaClave(1)}`, 'Tienda Central');
  await guardar();
  assert.match(texto(), /Elige al menos una boleta para la parada 1\./);
  assert.equal(posts().length, 0);
  assert.equal(campo('ruta-fecha').props.value, PROGRAMADA);
  assert.equal(conAria('Elegir vehículo VEH-01').props.checked, true);
});

test('rechaza una fecha anterior a hoy', async () => {
  await montar();
  await completarRuta();
  await cambiar('ruta-fecha', '2020-01-01');
  await guardar();
  assert.match(texto(), /no puede ser anterior a hoy/);
  assert.equal(posts().length, 0);
});

test('solo ofrece boletas libres de ruta activa y actualiza la lista tras guardar', async () => {
  await montar();
  assert.equal(llamadas.find((l) => l.path.endsWith('/boletas-disponibles')).metodo, 'GET');
  await cambiar('ruta-grupo', '5');
  const ids = () => root.root.findAll((n) => n.type === 'input' && n.props.type === 'checkbox').map((n) => n.props.id.split('-boleta-')[1]);
  assert.deepEqual(ids(), ['1', '2'], 'la boleta 3 ya está en la ruta #9');
  await completarRuta();
  await guardar();
  await cambiar('ruta-grupo', '5');
  assert.deepEqual(ids(), ['2'], 'la boleta 1 quedó asignada a la ruta nueva y deja de ofrecerse');
});

test('si otra ruta tomó una boleta, el 409 refresca la lista sin borrar el formulario', async () => {
  await montar();
  await completarRuta();
  respuestaPost = () => {
    rutas.push({ ...rutaGuardada('12'), paradas: [{ id: 'x', secuencia: 1, destino: 'Otra', boletas: [{ boletaId: '1' }] }] });
    return json({ statusCode: 409, message: 'Boletas ya asignadas a otra ruta activa: 1 (ruta 12)' }, 409);
  };
  await guardar();
  assert.match(texto(), /Boletas ya asignadas a otra ruta activa: 1 \(ruta 12\)/);
  assert.equal(campo('ruta-fecha').props.value, PROGRAMADA);
  assert.equal(llamadas.filter((l) => l.path.endsWith('/boletas-disponibles')).length, 2);
  assert.equal(root.root.findAll((n) => n.type === 'input' && n.props.id?.endsWith('-boleta-1')).length, 0);
});

test('una boleta elegida en una parada no se puede repetir en otra', async () => {
  await montar();
  await completarRuta();
  await act(async () => conAria('Planificar ruta').findAll((n) => n.type === 'button' && textoDe(n.children) === 'Agregar parada')[0].props.onClick());
  assert.equal(checkboxBoleta('1', 2).props.disabled, true);
  assert.equal(checkboxBoleta('2', 2).props.disabled, false);
});

test('edita una ruta planificada con un PUT que reemplaza las paradas', async () => {
  await montar();
  await pulsar('Editar ruta 9');
  assert.match(texto(), /Editar ruta #9/);
  assert.equal(campo('ruta-fecha').props.value, PROGRAMADA);
  assert.equal(checkboxBoleta('3').props.checked, true, 'sus propias boletas siguen disponibles al editar');
  await cambiar(`parada-destino-${paradaClave(1)}`, 'Sucursal Norte');
  await alternarBoleta('2');
  await guardar();
  assert.equal(posts().length, 0);
  assert.equal(puts().length, 1);
  assert.equal(puts()[0].path, '/api/logistica/rutas/9');
  assert.deepEqual(puts()[0].cuerpo, {
    grupoId: '5', fechaProgramada: PROGRAMADA, vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12',
    paradas: [{ destino: 'Sucursal Norte', boletaIds: ['3', '2'] }],
  });
  assert.match(texto(), /Ruta #9 actualizada como planificada/);
});

test('un error al editar conserva los cambios y se puede cancelar la edición', async () => {
  respuestaPost = () => json({ statusCode: 409, message: 'La ruta ya fue despachada.' }, 409);
  await montar();
  await pulsar('Editar ruta 9');
  await cambiar(`parada-destino-${paradaClave(1)}`, 'Sucursal Norte');
  await guardar();
  assert.match(texto(), /La ruta ya fue despachada\./);
  assert.equal(campo(`parada-destino-${paradaClave(1)}`).props.value, 'Sucursal Norte');
  await act(async () => root.root.find((n) => n.type === 'button' && textoDe(n.children) === 'Cancelar edición').props.onClick());
  assert.match(texto(), /Nueva ruta/);
  assert.equal(campo('ruta-fecha').props.value, '');
});

test('solo las rutas planificadas tienen el botón Editar', async () => {
  rutas = [rutaGuardada('9'), rutaGuardada('11', 'DESPACHADA')];
  await montar();
  assert.ok(conAria('Editar ruta 9'));
  assert.equal(root.root.findAll((n) => n.props?.['aria-label'] === 'Editar ruta 11').length, 0);
});

test('avisa cuando los recursos vienen de la copia de respaldo del ERP', async () => {
  respuestaRecursos = (fecha) => json(recursosDe(fecha, 'RESPALDO'));
  await montar();
  await cambiar('ruta-fecha', PROGRAMADA);
  assert.match(texto(), /Copia de respaldo/);
  assert.match(texto(), /El ERP no respondió\./);
});

test('si no hay ERP ni copia muestra el error sin perder el formulario', async () => {
  respuestaRecursos = () => json({ statusCode: 503, codigo: 'RECURSOS_NO_DISPONIBLES', message: 'El ERP no responde y no hay copia de respaldo.' }, 503);
  await montar();
  await cambiar('ruta-grupo', '5');
  assert.match(texto(), /El ERP no responde y no hay copia de respaldo\./);
  assert.equal(campo('ruta-fecha').props.value, PROGRAMADA);
  assert.equal(campo(`parada-destino-${paradaClave(1)}`).props.value, 'Tienda Central');
});

test('la pantalla exige el permiso logistica.rutas.gestionar', async () => {
  globalThis.__usuarioRutas.permisos = [{ codigo: 'logistica.rutas.consultar' }];
  await montar(AppRoutes, '/logistica/planificacion');
  assert.match(texto(), /Acceso denegado/);
  await act(async () => root.unmount());
  globalThis.__usuarioRutas.permisos = [{ codigo: 'logistica.rutas.gestionar' }];
  await montar(AppRoutes, '/logistica/planificacion');
  assert.doesNotMatch(texto(), /Acceso denegado/);
  assert.match(texto(), /Planificar ruta/);
});
