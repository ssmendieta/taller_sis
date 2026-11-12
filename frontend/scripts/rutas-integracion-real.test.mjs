import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer as createVite } from 'vite';

// ABC-373: componentes y servicio frontend sin modificar, API Nest y PostgreSQL
// nativo. Solo Auth, ERP y Producción se simulan por HTTP. No sustituye una
// revisión visual en navegador ni demuestra Docker o Google Cloud.
if (process.env.LOGISTICA_DB_REAL !== '1') {
  throw new Error('Esta suite requiere LOGISTICA_DB_REAL=1 y una base PostgreSQL de prueba.');
}
const backend = fileURLToPath(new URL('../../services/logistica-service/', import.meta.url));
const requireBackend = createRequire(`${backend}package.json`);
requireBackend('ts-node').register({ project: `${backend}tsconfig.json`, transpileOnly: true });
requireBackend('reflect-metadata');
const { Test } = requireBackend('@nestjs/testing');
const { TypeOrmModule } = requireBackend('@nestjs/typeorm');
const { DataSource } = requireBackend('typeorm');
const { AppDataSource } = requireBackend(`${backend}src/database/data-source.ts`);
const { RutasModule } = requireBackend(`${backend}src/rutas/rutas.module.ts`);
const { AgrupacionModule } = requireBackend(`${backend}src/agrupacion/agrupacion.module.ts`);
const schema = `abc373_ui_${process.pid}_${Date.now()}`;
const options = { ...AppDataSource.options, schema,
  extra: { options: `-c search_path=${schema}`, max: 10 } };
const fecha = new Date();
fecha.setDate(fecha.getDate() + 3);
const PROGRAMADA = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const originales = new Map(['document', 'sessionStorage', 'localStorage'].map((k) => [k, globalThis[k]]));
const nombresEnv = ['AUTH_SERVICE_URL', 'PRODUCCION_SERVICE_URL', 'ERP_RECURSOS_URL', 'ERP_RECURSOS_TOKEN', 'ERP_RECURSOS_REINTENTOS'];
const envOriginal = new Map(nombresEnv.map((k) => [k, process.env[k]]));
let admin, db, app, externos, vite, Pagina, root, base, token, grupo, boletas, creado = false;
let unidad = 'kg';
let puertoApi = 0;

async function iniciarApi() {
  const module = await Test.createTestingModule({ imports: [
    TypeOrmModule.forRoot({ ...options, migrations: [], retryAttempts: 0 }), RutasModule, AgrupacionModule,
  ] }).compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/logistica');
  await app.listen(puertoApi, '127.0.0.1');
  base = await app.getUrl();
  puertoApi = Number(new URL(base).port);
}

before(async () => {
  admin = new DataSource({ ...options, migrations: [], entities: [] });
  await admin.initialize();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  creado = true;
  db = new DataSource(options);
  await db.initialize();
  await db.runMigrations({ transaction: 'all' });
  externos = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/me') {
      const permisos = ['logistica.rutas.consultar', 'logistica.boletas.consultar', 'logistica.solicitudes.consultar'];
      if (req.headers.authorization === 'Bearer gestor') permisos.push('logistica.rutas.gestionar');
      else if (req.headers.authorization !== 'Bearer lector') return json(401, { message: 'Sesión de prueba inválida' });
      return json(200, { id: '42', permisos });
    }
    if (url.pathname === '/v1/recursos-logisticos') {
      if (req.headers.authorization !== 'Bearer erp-prueba') return json(401, {});
      return json(200, { version: 'recursos-logisticos.v1', fecha: url.searchParams.get('fecha'),
        generadoEn: new Date().toISOString(),
        vehiculos: ['V1', 'V2'].map((idExterno) => ({ idExterno, placa: idExterno, descripcion: null,
          capacidad: { valor: '15.0000', unidad: 'kg' }, disponible: true })),
        choferes: ['C1', 'C2'].map((idExterno) => ({ idExterno, nombre: idExterno, licenciaCategoria: null, disponible: true })),
      });
    }
    if (/^\/ordenes\/\d+$/.test(url.pathname)) return json(200, { id: url.pathname.split('/').pop(),
      codigo: `ORD-${url.pathname.split('/').pop()}`, producto_id: '1', producto: { unidad_producto: unidad } });
    json(404, {});
  });
  await new Promise((resolve) => externos.listen(0, '127.0.0.1', resolve));
  const externoUrl = `http://127.0.0.1:${externos.address().port}`;
  Object.assign(process.env, { AUTH_SERVICE_URL: externoUrl, PRODUCCION_SERVICE_URL: externoUrl,
    ERP_RECURSOS_URL: externoUrl, ERP_RECURSOS_TOKEN: 'erp-prueba', ERP_RECURSOS_REINTENTOS: '0' });
  await iniciarApi();
  globalThis.__abc373Api = base;
  vite = await createVite({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' }, plugins: [{ name: 'url-api-prueba', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/services/api.js')) {
        return 'export const apiConfig = { get gatewayUrl() { return globalThis.__abc373Api; } };';
      }
    } }] });
  ({ default: Pagina } = await vite.ssrLoadModule('/src/pages/RutasPage.jsx'));
});

beforeEach(async () => {
  token = 'gestor'; unidad = 'kg';
  globalThis.__abc373Api = base;
  globalThis.document = { title: '' };
  globalThis.sessionStorage = { getItem: (k) => k === 'accessToken' ? token : null };
  globalThis.localStorage = { getItem: () => null };
  await db.query('TRUNCATE rutas, solicitudes_salida, grupos_salida, recursos_externos_snapshots RESTART IDENTITY CASCADE');
  boletas = [];
  for (const cantidad of ['5.0000', '2.1250']) {
    const [solicitud] = await db.query(`INSERT INTO solicitudes_salida
      (orden_id,destino_documental,motivo,responsable_usuario_id,estado)
      VALUES ($1,'Tienda','ABC-373 UI',42,'PREPARADA') RETURNING id::text`, [String(boletas.length + 1)]);
    const [boleta] = await db.query(`INSERT INTO boletas_envio
      (solicitud_salida_id,responsable_usuario_id,estado,producto_codigo,unidad,numero)
      VALUES ($1,42,'EMITIDA','PAN-01','kg',$2) RETURNING id::text`, [solicitud.id, `BOL-UI-${boletas.length + 1}`]);
    await db.query('INSERT INTO boletas_envio_items (boleta_id,referencia,cantidad) VALUES ($1,\'Lote de prueba\',$2)', [boleta.id, cantidad]);
    boletas.push(boleta.id);
  }
  [grupo] = await db.query(`INSERT INTO grupos_salida
    (destino,fecha_requerida,tipo_carga,unidad_carga,creado_por_usuario_id)
    VALUES ('Tienda',$1,'Seca','kg',42) RETURNING id::text`, [PROGRAMADA]);
  await db.query(`INSERT INTO grupos_salida_solicitudes (grupo_id,solicitud_id)
    SELECT $1,solicitud_salida_id FROM boletas_envio`, [grupo.id]);
});

async function desmontar() { if (root) await act(async () => root.unmount()); root = null; }
afterEach(desmontar);
after(async () => {
  try {
    await desmontar();
    await vite?.close();
    await app?.close();
    if (externos?.listening) { externos.closeAllConnections(); await new Promise((resolve) => externos.close(resolve)); }
    if (db?.isInitialized) await db.destroy();
    if (creado && admin?.isInitialized) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    if (admin?.isInitialized) await admin.destroy();
    delete globalThis.__abc373Api;
    for (const [key, value] of originales) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    for (const [key, value] of envOriginal) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

const textoDe = (n) => n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(textoDe).join('') : textoDe(n.children);
const texto = () => textoDe(root.toJSON());
const campo = (id) => root.root.find((n) => typeof n.type === 'string' && n.props.id === id);
const aria = (name) => root.root.find((n) => typeof n.type === 'string' && n.props['aria-label'] === name);
const cantidadRutas = async () => (await db.query('SELECT count(*)::int AS n FROM rutas'))[0].n;
async function esperar(check) {
  for (let i = 0; i < 100; i++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
    if (check()) return;
  }
  assert.fail(`La interfaz no alcanzó el estado esperado: ${texto()}`);
}
async function montar() {
  await act(async () => { root = Renderer.create(React.createElement(MemoryRouter,
    { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Pagina))); });
  await esperar(() => !texto().includes('Cargando rutas') && !texto().includes('Cargando boletas'));
  assert.doesNotMatch(texto(), /servidor devolvió|No se pudieron|No tienes permiso|no está disponible|Failed to parse/, texto());
}
async function cambiar(id, value) { await act(async () => campo(id).props.onChange({ target: { value } })); }
async function completar() {
  await cambiar('ruta-grupo', grupo.id);
  await esperar(() => root.root.findAll((n) => n.props?.['aria-label'] === 'Elegir vehículo V1').length > 0);
  const destino = root.root.find((n) => n.type === 'input' && /^parada-destino-/.test(n.props.id ?? ''));
  assert.ok(root.root.findAll((n) => n.type === 'input' && n.props.type === 'checkbox').length, `No se cargaron las boletas en la interfaz: ${texto()}`);
  await act(async () => {
    root.root.find((n) => n.type === 'input' && n.props.id?.endsWith(`-boleta-${boletas[0]}`)).props.onChange();
    aria('Elegir vehículo V1').props.onChange();
    aria('Elegir chofer C1').props.onChange();
  });
  return destino.props.id;
}
async function guardar() { await act(async () => aria('Planificar ruta').props.onSubmit({ preventDefault() {} })); }

test('CA-01/05: crea desde React, guarda en PostgreSQL y recupera al reiniciar API y pantalla', async () => {
  await montar(); await completar(); await guardar();
  assert.match(texto(), /guardada como planificada/);
  const [ruta] = await db.query('SELECT id::text,grupo_id::text,responsable_usuario_id::text FROM rutas');
  assert.deepEqual(ruta, { id: '1', grupo_id: grupo.id, responsable_usuario_id: '42' });
  await desmontar(); await app.close(); await iniciarApi(); globalThis.__abc373Api = base;
  await montar();
  assert.ok(root.root.findAll((n) => n.props?.['aria-label'] === `Editar ruta ${ruta.id}`).length);
  await act(async () => aria(`Editar ruta ${ruta.id}`).props.onClick());
  await esperar(() => !texto().includes('Cargando boletas'));
  assert.equal(campo('ruta-fecha').props.value, PROGRAMADA);
  const elegida = root.root.find((n) => n.type === 'input' && n.props.id?.endsWith(`-boleta-${boletas[0]}`));
  assert.equal(elegida.props.checked, true);
});

test('CA-04: edita una ruta y conserva boletas propias, grupo y recursos en la base', async () => {
  await montar(); await completar(); await guardar();
  await act(async () => aria('Editar ruta 1').props.onClick());
  await esperar(() => !texto().includes('Cargando boletas'));
  const destino = root.root.find((n) => n.type === 'input' && /^parada-destino-/.test(n.props.id ?? ''));
  await cambiar(destino.props.id, 'Sucursal nueva'); await guardar();
  assert.match(texto(), /actualizada como planificada/);
  assert.equal((await db.query('SELECT destino FROM rutas_paradas'))[0].destino, 'Sucursal nueva');
  assert.equal(await cantidadRutas(), 1);
});

for (const caso of ['sobrecapacidad', 'unidad incompatible', 'boleta anulada']) {
  test(`CA-03/04: ${caso} se muestra como error y conserva el formulario sin persistencia parcial`, async () => {
    await montar(); const destino = await completar();
    if (caso === 'sobrecapacidad') await db.query('UPDATE boletas_envio_items SET cantidad=100');
    if (caso === 'unidad incompatible') unidad = 'l';
    if (caso === 'boleta anulada') await db.query("UPDATE boletas_envio SET estado='ANULADA' WHERE id=$1", [boletas[0]]);
    await guardar();
    assert.match(texto(), /Tus datos siguen en el formulario/);
    assert.doesNotMatch(texto(), /orden incompleta|No se pudo obtener/);
    assert.equal(campo(destino).props.value, 'Tienda');
    assert.equal(campo('ruta-grupo').props.value, grupo.id);
    assert.equal(await cantidadRutas(), 0);
  });
}

test('CA-02: conflicto de recurso ocupado aparece en pantalla y no crea una segunda ruta', async () => {
  await montar(); await completar(); await guardar();
  await cambiar('ruta-grupo', grupo.id);
  await esperar(() => root.root.findAll((n) => n.props?.['aria-label'] === 'Elegir vehículo V1').length > 0);
  await act(async () => {
    root.root.find((n) => n.type === 'input' && n.props.id?.endsWith(`-boleta-${boletas[1]}`)).props.onChange();
    aria('Elegir vehículo V1').props.onChange(); aria('Elegir chofer C1').props.onChange();
  });
  await guardar();
  assert.match(texto(), /Tus datos siguen en el formulario/);
  assert.match(texto(), /Vehículo|Chofer/);
  assert.equal(await cantidadRutas(), 1);
});

test('CA-04: despacho concurrente bloquea una edición abierta sin sobrescribir la ruta', async () => {
  await montar(); await completar(); await guardar();
  await act(async () => aria('Editar ruta 1').props.onClick());
  await esperar(() => !texto().includes('Cargando boletas'));
  await db.query("UPDATE rutas SET estado='DESPACHADA',despachada_en=NOW(),despachada_por_usuario_id=42 WHERE id=1");
  await guardar();
  assert.match(texto(), /Tus datos siguen en el formulario/);
  assert.equal((await db.query('SELECT estado FROM rutas WHERE id=1'))[0].estado, 'DESPACHADA');
});

for (const [sesion, patron] of [['lector', /No tienes permiso/], ['invalido', /Tu sesión expiró/]]) {
  test(`permisos: sesión ${sesion} muestra el rechazo del servidor y conserva los datos`, async () => {
    await montar(); await completar(); token = sesion; await guardar();
    assert.match(texto(), patron);
    assert.equal(campo('ruta-grupo').props.value, grupo.id);
    assert.equal(await cantidadRutas(), 0);
  });
}
