import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import Renderer, { act } from "react-test-renderer";
import { createServer } from "vite";

const respuesta = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status,
  headers: { "Content-Type": "application/json" },
});
const fetchOriginal = globalThis.fetch;
const sessionOriginal = globalThis.sessionStorage;
const localOriginal = globalThis.localStorage;
const defectos = [{
  id: "11",
  cantidad: "5.0000",
  causaDefecto: "Sellado incompleto",
  fechaHora: "2026-11-10T12:00:00.000Z",
}];

let vite;
let ReprocesosOrden;
let servicio;
let root;
let llamadas;
let items;
let totales;
let postPendiente;
let respuestaPost;
let respuestaGet;

before(async () => {
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: "automatic" },
  });
  ({ default: ReprocesosOrden } = await vite.ssrLoadModule("/src/components/ordenes/ReprocesosOrden.jsx"));
  servicio = await vite.ssrLoadModule("/src/services/reprocesosService.js");
});

beforeEach(() => {
  globalThis.sessionStorage = { getItem: (clave) => clave === "accessToken" ? "token-prueba" : null };
  globalThis.localStorage = { getItem: () => null };
  llamadas = [];
  items = [];
  totales = {
    conformes: "0.0000",
    defectuosas: "5.0000",
    procesadas: "0.0000",
    recuperadas: "0.0000",
    descartadas: "0.0000",
  };
  postPendiente = null;
  respuestaPost = null;
  respuestaGet = null;

  globalThis.fetch = async (url, opciones = {}) => {
    const path = new URL(url).pathname;
    const method = opciones.method || "GET";
    const body = opciones.body ? JSON.parse(opciones.body) : undefined;
    llamadas.push({ path, method, body, headers: opciones.headers });

    if (path.endsWith("/api/produccion/ordenes/7/reprocesos") && method === "GET") {
      return respuestaGet ? respuestaGet() : respuesta({ items, totales });
    }
    if (path.endsWith("/api/produccion/ordenes/7/reprocesos") && method === "POST") {
      if (postPendiente) await postPendiente;
      if (respuestaPost) return respuestaPost();
      const guardado = {
        id: String(items.length + 1),
        ordenId: "7",
        ...body,
        autorUsuarioId: "42",
        fechaHora: "2026-11-10T15:00:00.000Z",
      };
      items.push(guardado);
      totales = {
        conformes: Number(body.cantidadRecuperada).toFixed(4),
        defectuosas: (5 - Number(body.cantidadProcesada)).toFixed(4),
        procesadas: Number(body.cantidadProcesada).toFixed(4),
        recuperadas: Number(body.cantidadRecuperada).toFixed(4),
        descartadas: Number(body.cantidadDescartada).toFixed(4),
      };
      return respuesta({ reproceso: guardado, totales }, 201);
    }
    throw new Error(`Petición inesperada: ${method} ${url}`);
  };
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  root = null;
});

after(async () => {
  await vite?.close();
  globalThis.fetch = fetchOriginal;
  for (const [clave, valor] of [["sessionStorage", sessionOriginal], ["localStorage", localOriginal]]) {
    if (valor === undefined) delete globalThis[clave];
    else globalThis[clave] = valor;
  }
});

async function montar(props = {}) {
  await act(async () => {
    root = Renderer.create(React.createElement(ReprocesosOrden, {
      ordenId: "7",
      defectos,
      unidad: "u",
      permiteRegistrar: true,
      usuario: { id: 42, nombre_completo: "Sergio Prueba" },
      revisionCalidad: "11:5.0000",
      ...props,
    }));
  });
}

const texto = () => JSON.stringify(root.toJSON());
const posts = () => llamadas.filter((llamada) => llamada.method === "POST");
const gets = () => llamadas.filter((llamada) => llamada.method === "GET");
const formulario = () => root.root.findByType("form");

async function cambiar(id, value) {
  await act(async () => {
    root.root.findByProps({ id }).props.onChange({ target: { value } });
  });
}

async function completar(procesada = "3", recuperada = "2", descartada = "1") {
  await cambiar("reproceso-resultado", "11");
  await cambiar("reproceso-procesada", procesada);
  await cambiar("reproceso-recuperada", recuperada);
  await cambiar("reproceso-descartada", descartada);
}

test("servicio usa el gateway, Bearer y el contrato exacto de ABC-396", async () => {
  await servicio.listarReprocesosOrden(7);
  await servicio.registrarReproceso({
    ordenId: 7,
    resultadoCalidadId: 11,
    cantidadProcesada: 3,
    cantidadRecuperada: 2,
    cantidadDescartada: 1,
    autorUsuarioId: 99,
  });

  assert.equal(llamadas[0].path, "/api/produccion/ordenes/7/reprocesos");
  assert.equal(llamadas[0].headers.Authorization, "Bearer token-prueba");
  assert.equal(llamadas[1].headers.Authorization, "Bearer token-prueba");
  assert.deepEqual(llamadas[1].body, {
    resultadoCalidadId: "11",
    cantidadProcesada: 3,
    cantidadRecuperada: 2,
    cantidadDescartada: 1,
  });
});

test("carga saldos, causa y estado vacío del historial", async () => {
  await montar();
  assert.match(texto(), /Sellado incompleto/);
  assert.match(texto(), /5 u/);
  assert.match(texto(), /todavía no tiene reprocesos registrados/);
  assert.equal(gets().length, 1);
});

test("registra 3, recupera 2 y descarta 1; refresca sin recargar la página", async () => {
  const cambios = [];
  await montar({ onTotalesChange: (valor) => cambios.push(valor) });
  await completar();
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });

  assert.equal(posts().length, 1);
  assert.deepEqual(posts()[0].body, {
    resultadoCalidadId: "11",
    cantidadProcesada: 3,
    cantidadRecuperada: 2,
    cantidadDescartada: 1,
  });
  assert.ok(gets().length >= 2, "vuelve a leer saldos e historial después del POST");
  assert.match(texto(), /Reproceso registrado correctamente/);
  assert.match(texto(), /Sergio Prueba/);
  assert.match(texto(), /2 u/);
  assert.equal(cambios.at(-1).defectuosas, "2.0000");
  assert.equal(root.root.findByProps({ id: "reproceso-procesada" }).props.value, "");
});

test("impide el doble envío antes de que responda el servidor", async () => {
  let liberar;
  postPendiente = new Promise((resolver) => { liberar = resolver; });
  await montar();
  await completar();
  let primero;
  await act(async () => {
    primero = formulario().props.onSubmit({ preventDefault() {} });
    formulario().props.onSubmit({ preventDefault() {} });
  });
  assert.equal(posts().length, 1);
  await act(async () => { liberar(); await primero; });
  assert.equal(posts().length, 1);
});

test("valida balance, decimales y saldo antes de llamar a la API", async () => {
  await montar();
  await completar("3", "1", "1");
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });
  assert.match(texto(), /deben sumar la procesada/);

  await completar("5.00001", "4", "1.00001");
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });
  assert.match(texto(), /hasta 4 decimales/);

  await completar("6", "5", "1");
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });
  assert.match(texto(), /supera el saldo disponible/);
  assert.equal(posts().length, 0);
});

test("un conflicto conserva el formulario, muestra el error y refresca el saldo", async () => {
  respuestaPost = () => respuesta({ message: "La cantidad procesada supera el saldo defectuoso disponible" }, 409);
  await montar();
  await completar();
  const getAntes = gets().length;
  await act(async () => { await formulario().props.onSubmit({ preventDefault() {} }); });
  assert.match(texto(), /supera el saldo defectuoso disponible/);
  assert.equal(root.root.findByProps({ id: "reproceso-procesada" }).props.value, "3");
  assert.ok(gets().length > getAntes);
});

test("informa un error de carga y permite reintentar", async () => {
  respuestaGet = () => respuesta({ message: "No se pudo comprobar la sesión con Auth" }, 503);
  await montar();
  assert.match(texto(), /No se pudo comprobar la sesión con Auth/);
  respuestaGet = null;
  const boton = root.root.findAll((nodo) => nodo.type === "button" && nodo.children.includes("Reintentar"))[0];
  await act(async () => { await boton.props.onClick(); });
  assert.match(texto(), /Sellado incompleto/);
});

test("sin permiso oculta el formulario pero conserva saldos e historial", async () => {
  items = [{
    id: "1",
    resultadoCalidadId: "11",
    cantidadProcesada: "3.0000",
    cantidadRecuperada: "2.0000",
    cantidadDescartada: "1.0000",
    autorUsuarioId: "43",
    fechaHora: "2026-11-10T15:00:00.000Z",
  }];
  await montar({ permiteRegistrar: false });
  assert.equal(root.root.findAllByType("form").length, 0);
  assert.match(texto(), /No tienes permiso para registrar reprocesos/);
  assert.match(texto(), /Usuario 43/);
});
