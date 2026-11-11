import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// ABC-333: listado y filtros del historial de producción en pantalla.
let vite, Pagina, Rutas, servicio, root, llamadas, respuesta;
const originales = Object.fromEntries(
  ['fetch', 'document', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]])
);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const orden = (id, cambios = {}) => ({
  id,
  codigo: `OP-2026-000${id}`,
  producto_id: 1,
  producto_codigo: 'PROD-01',
  producto_nombre: 'Pintura Látex Blanca',
  unidad_producto: 'L',
  cantidad_solicitada: '500.0000',
  fecha_programada: '2026-11-10',
  estado: 'PLANIFICADA',
  responsable_usuario_id: 2,
  responsable_nombre: 'Supervisor Test',
  ...cambios,
});

before(async () => {
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' },
    plugins: [
      {
        name: 'sesion-historial-produccion-prueba',
        enforce: 'pre',
        transform(_code, id) {
          if (id.replaceAll('\\', '/').endsWith('/context/SesionContext.jsx')) {
            return 'export function useSesion(){return {usuario: globalThis.__usuarioHistorialProd, salir(){}};}';
          }
        },
      },
    ],
  });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/HistorialProduccionPage.jsx'));
  ({ default: Rutas } = await vite.ssrLoadModule('/src/routes/AppRoutes.jsx'));
  servicio = await vite.ssrLoadModule('/src/services/historialProduccionService.js');
});

beforeEach(() => {
  llamadas = [];
  respuesta = (params) =>
    json({
      items: [
        orden(12, { estado: 'EN_PROCESO', responsable_nombre: 'Andrés Pabón' }),
        orden(11, { estado: 'COMPLETADA', producto_nombre: 'Esmalte Sintético' }),
      ],
      total: 15,
      page: Number(params.get('page') || 1),
      limit: Number(params.get('limit') || 10),
      totalPages: 2,
    });

  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (k) => (k === 'accessToken' ? 'token-prueba-historial' : null) };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__usuarioHistorialProd = { id: '3', permisos: ['ordenes.consultar'] };

  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    llamadas.push({
      path: u.pathname,
      params: u.searchParams,
      auth: opts.headers?.Authorization,
    });
    return respuesta(u.searchParams);
  };
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

after(async () => {
  await vite?.close();
  Object.assign(globalThis, originales);
  delete globalThis.__usuarioHistorialProd;
});

async function montar(Component = Pagina, rutaInicial = '/') {
  await act(async () => {
    root = Renderer.create(
      React.createElement(
        MemoryRouter,
        { initialEntries: [rutaInicial] },
        React.createElement(Component)
      )
    );
  });
}

const texto = () => JSON.stringify(root.toJSON());
const ultima = () => Object.fromEntries(llamadas.at(-1).params);

async function cambiar(id, value) {
  await act(async () => {
    root.root.findByProps({ id }).props.onChange({ target: { value } });
  });
}

async function aplicar() {
  const form = root.root.find((n) => n.type === 'form');
  await act(async () => {
    form.props.onSubmit({ preventDefault() {} });
  });
}

const boton = (etiqueta) =>
  root.root.find((n) => n.type === 'button' && n.children.includes(etiqueta));

// --- TESTS ---

test('1. Consulta inicial: gateway, token Bearer y omisión de parámetros vacíos', async () => {
  await montar();
  assert.equal(llamadas[0].path, '/api/produccion/historial/ordenes');
  assert.equal(llamadas[0].auth, 'Bearer token-prueba-historial');
  assert.deepEqual(ultima(), { page: '1', limit: '10' });
  assert.match(texto(), /OP-2026-00012/);
  assert.match(texto(), /Pintura Látex Blanca/);
  assert.match(texto(), /EN PROCESO/);
  assert.match(texto(), /COMPLETADA/);
  assert.match(texto(), /15.*órdenes encontradas/);
});

test('2. Envío combinado de filtros: fechaDesde, fechaHasta, estado y producto', async () => {
  await montar();
  await cambiar('historial-desde', '2026-11-01');
  await cambiar('historial-hasta', '2026-11-30');
  await cambiar('historial-estado', 'EN_PROCESO');
  await cambiar('historial-producto', '  Látex  ');
  await aplicar();

  assert.deepEqual(ultima(), {
    page: '1',
    limit: '10',
    fechaDesde: '2026-11-01',
    fechaHasta: '2026-11-30',
    estado: 'EN_PROCESO',
    producto: 'Látex',
  });
});

test('3. Conserva filtros al paginar (Página siguiente)', async () => {
  await montar();
  await cambiar('historial-estado', 'COMPLETADA');
  await aplicar();

  const btnSiguiente = boton('Siguiente');
  await act(async () => {
    btnSiguiente.props.onClick();
  });

  assert.deepEqual(ultima(), {
    page: '2',
    limit: '10',
    estado: 'COMPLETADA',
  });
});

test('4. Limpiar filtros restablece la búsqueda a los valores iniciales', async () => {
  await montar();
  await cambiar('historial-producto', 'Esmalte');
  await aplicar();

  const btnLimpiar = boton('Limpiar filtros');
  await act(async () => {
    btnLimpiar.props.onClick();
  });

  assert.deepEqual(ultima(), { page: '1', limit: '10' });
});

test('5. Validación en cliente: rechaza fechaDesde posterior a fechaHasta sin consultar API', async () => {
  await montar();
  const llamadasAntes = llamadas.length;

  await cambiar('historial-desde', '2026-11-20');
  await cambiar('historial-hasta', '2026-11-10');
  await aplicar();

  assert.equal(llamadas.length, llamadasAntes, 'No debió enviar fetch a la API');
  assert.match(texto(), /La fecha desde no puede ser posterior a la fecha hasta/);
});

test('6. Cada orden incluye enlace de solo lectura a su detalle /ordenes/:id', async () => {
  await montar();
  const enlaces = root.root.findAll((n) => n.props?.to?.startsWith?.('/ordenes/'));
  const destinos = enlaces.map((n) => n.props.to);
  assert.ok(destinos.includes('/ordenes/12'));
  assert.ok(destinos.includes('/ordenes/11'));
});

test('7. Estado vacío: muestra mensaje claro cuando no hay resultados', async () => {
  respuesta = () =>
    json({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

  await montar();
  assert.match(texto(), /No se encontraron órdenes para los criterios aplicados/);
});

test('8. Error del servidor: visualiza mensaje amigable y permite reintentar', async () => {
  respuesta = () =>
    json({ message: 'Error interno en la base de datos' }, 500);

  await montar();
  assert.match(texto(), /Error interno en la base de datos/);

  respuesta = (params) =>
    json({
      items: [orden(1)],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

  const btnReintentar = boton('Reintentar');
  await act(async () => {
    btnReintentar.props.onClick();
  });

  assert.match(texto(), /OP-2026-0001/);
});

test('9. Control de permisos: usuario sin ordenes.consultar no realiza peticiones', async () => {
  globalThis.__usuarioHistorialProd = { id: '9', permisos: ['auditoria.consultar'] };
  await montar();

  assert.equal(llamadas.length, 0, 'No debe realizar fetch');
  assert.match(texto(), /No tienes permiso para consultar el historial/);
});

test('10. Enrutamiento en AppRoutes: ruta /produccion/historial y redirección /ordenes/historial', async () => {
  await montar(Rutas, '/produccion/historial');
  assert.equal(llamadas[0].path, '/api/produccion/historial/ordenes');
});

test('11. Unidad de servicio validarFiltrosHistorial: comprueba reglas de negocio', () => {
  assert.throws(
    () => servicio.validarFiltrosHistorial({ campoInvalido: 'x' }),
    /Parámetro no permitido: campoInvalido/
  );
  assert.throws(
    () => servicio.validarFiltrosHistorial({ page: 0 }),
    /La página debe ser un número entero mayor o igual a 1/
  );
  assert.throws(
    () => servicio.validarFiltrosHistorial({ limit: 150 }),
    /El límite debe ser un número entero entre 1 y 100/
  );
  assert.throws(
    () => servicio.validarFiltrosHistorial({ fechaDesde: '2026-02-31' }),
    /fechas válidas del calendario/
  );
  assert.throws(
    () => servicio.validarFiltrosHistorial({ estado: 'ESTADO_INEXISTENTE' }),
    /Estado inválido/
  );
  assert.throws(
    () => servicio.validarFiltrosHistorial({ producto: 'a'.repeat(151) }),
    /admite hasta 150 caracteres/
  );

  const limpio = servicio.validarFiltrosHistorial({
    fechaDesde: '2026-11-01',
    fechaHasta: '2026-11-15',
    estado: 'COMPLETADA',
    producto: 'Pintura',
    page: 2,
    limit: 20,
  });

  assert.deepEqual(limpio, {
    fechaDesde: '2026-11-01',
    fechaHasta: '2026-11-15',
    estado: 'COMPLETADA',
    producto: 'Pintura',
    page: 2,
    limit: 20,
  });
});
