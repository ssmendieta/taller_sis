import { before, after, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import Renderer, { act } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

// ABC-358/ABC-366: consulta separada de demandas recibidas y planificables.
let vite, Pagina, root, llamadas, respuesta;
const originales = Object.fromEntries(
  ["fetch", "document", "sessionStorage", "localStorage"].map((k) => [k, globalThis[k]]),
);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const demandaPrueba = (id, cambios = {}) => ({
  id,
  origen: "VENTAS",
  demandaExternaId: `ORD-${id}`,
  fechaRequerida: "2026-11-20",
  estado: "RECIBIDA",
  recibidaEn: "2026-11-06T00:00:00.000Z",
  confirmadaEn: null,
  items: [
    { id: 10 + id, productoCodigo: "PROD-PAN", cantidad: 50, unidad: "UNIDAD" },
    { id: 20 + id, productoCodigo: "PROD-HARINA", cantidad: 10.5, unidad: "KG" },
  ],
  ...cambios,
});

before(async () => {
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: "automatic" },
    plugins: [
      {
        name: "sesion-demandas-prueba",
        enforce: "pre",
        transform(_code, id) {
          if (id.replaceAll("\\", "/").endsWith("/context/SesionContext.jsx")) {
            return "export function useSesion(){return {usuario: globalThis.__usuarioDemandas};}";
          }
        },
      },
    ],
  });
  ({ default: Pagina } = await vite.ssrLoadModule("/src/pages/DemandasPage.jsx"));
});

beforeEach(() => {
  llamadas = [];
  respuesta = (params) =>
    json({
      items: [
        demandaPrueba(1),
        demandaPrueba(2, {
          origen: "FACTURACION",
          demandaExternaId: "FAC-99",
          estado: "CONFIRMADA",
          confirmadaEn: "2026-11-06T02:00:00.000Z",
        }),
      ],
      total: 12,
      page: Number(params.get("page") || 1),
      limit: Number(params.get("limit") || 10),
      totalPages: 2,
    });

  globalThis.document = { title: "" };
  globalThis.sessionStorage = {
    getItem: (k) => (k === "accessToken" ? "token-demanda" : null),
  };
  globalThis.localStorage = { getItem: () => null };
  globalThis.__usuarioDemandas = { id: "1", permisos: ["ordenes.consultar"] };
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url, "http://localhost");
    llamadas.push({
      path: u.pathname,
      params: u.searchParams,
      auth: opts.headers?.Authorization,
    });
    return respuesta(u.searchParams, u.pathname);
  };
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

after(async () => {
  await vite?.close();
  Object.assign(globalThis, originales);
  delete globalThis.__usuarioDemandas;
});

async function montar() {
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, null, React.createElement(Pagina)));
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
  const form = root.root.find((n) => n.type === "form");
  await act(async () => form.props.onSubmit({ preventDefault() {} }));
}

const boton = (etiqueta) =>
  root.root.find(
    (n) =>
      n.type === "button" &&
      (n.children?.includes?.(etiqueta) ||
        n.children?.some?.((c) => typeof c === "string" && c.trim() === etiqueta)),
  );

test("carga la primera página por el gateway con el token", async () => {
  await montar();
  assert.equal(llamadas[0].path, "/api/produccion/demandas");
  assert.equal(llamadas[0].auth, "Bearer token-demanda");
  assert.deepEqual(ultima(), { page: "1", limit: "10" });
  assert.match(texto(), /Listado de demandas \(12\)/);
  assert.match(texto(), /ORD-1/);
  assert.match(texto(), /PROD-PAN/);
  assert.match(texto(), /Recibida/);
  assert.match(texto(), /FAC-99/);
});

test("envía los filtros combinados de origen y estado y vuelve a la página 1", async () => {
  await montar();
  await cambiar("filtro-demanda-origen", "VENTAS");
  await cambiar("filtro-demanda-estado", "RECIBIDA");
  await aplicar();
  assert.deepEqual(ultima(), {
    page: "1",
    limit: "10",
    origen: "VENTAS",
    estado: "RECIBIDA",
  });
});

test("al cambiar de página conserva los filtros aplicados", async () => {
  await montar();
  await cambiar("filtro-demanda-origen", "VENTAS");
  await aplicar();
  await act(async () => boton("Siguiente").props.onClick());
  assert.deepEqual(ultima(), { page: "2", limit: "10", origen: "VENTAS" });
});

test("limpiar filtros vuelve a la consulta inicial sin filtros", async () => {
  await montar();
  await cambiar("filtro-demanda-origen", "FACTURACION");
  await aplicar();
  assert.equal(ultima().origen, "FACTURACION");
  await act(async () => boton("Limpiar filtros").props.onClick());
  assert.deepEqual(ultima(), { page: "1", limit: "10" });
});

test("sin resultados muestra el estado vacío", async () => {
  respuesta = () => json({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
  await montar();
  assert.match(texto(), /No se encontraron demandas con los filtros seleccionados/);
});

test("un error de red se muestra y permite reintentar", async () => {
  respuesta = () => json({ message: "Error interno del servidor" }, 500);
  await montar();
  assert.match(texto(), /Error interno del servidor/);
  respuesta = (params) =>
    json({
      items: [demandaPrueba(1)],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  await act(async () => boton("Reintentar").props.onClick());
  assert.match(texto(), /Listado de demandas \(1\)/);
});

test("sin permiso no consulta y muestra aviso de restricción", async () => {
  globalThis.__usuarioDemandas = { id: "9", permisos: ["otra.cosa"] };
  await montar();
  assert.equal(llamadas.length, 0);
  assert.match(texto(), /No tienes permiso para consultar demandas/);
});

test("ABC-366 separa planificables y consume el endpoint que fuerza CONFIRMADA", async () => {
  respuesta = (params, path) => {
    if (path === "/api/produccion/demandas/planificables") {
      return json({
        items: [demandaPrueba(7, {
          estado: "CONFIRMADA",
          demandaExternaId: "PED-CONFIRMADA-7",
          confirmadaEn: "2026-11-07T10:00:00.000Z",
        })],
        total: 1,
        page: Number(params.get("page") || 1),
        limit: Number(params.get("limit") || 10),
        totalPages: 1,
      });
    }
    return json({ items: [demandaPrueba(1)], total: 1, page: 1, limit: 10, totalPages: 1 });
  };

  await montar();
  await act(async () => boton("Planificables").props.onClick());

  assert.equal(llamadas.at(-1).path, "/api/produccion/demandas/planificables");
  assert.deepEqual(ultima(), { page: "1", limit: "10" });
  assert.match(texto(), /Demandas planificables \(1\)/);
  assert.match(texto(), /PED-CONFIRMADA-7/);
  assert.match(texto(), /Solo se muestran demandas confirmadas/);
  assert.equal(root.root.findAllByProps({ id: "filtro-demanda-estado" }).length, 0);
});

test("ABC-366 filtra planificables por origen y conserva la paginación", async () => {
  respuesta = (params, path) => json({
    items: [demandaPrueba(8, { estado: "CONFIRMADA", confirmadaEn: "2026-11-07T11:00:00.000Z" })],
    total: path.endsWith("/planificables") ? 12 : 1,
    page: Number(params.get("page") || 1),
    limit: Number(params.get("limit") || 10),
    totalPages: path.endsWith("/planificables") ? 2 : 1,
  });

  await montar();
  await act(async () => boton("Planificables").props.onClick());
  await cambiar("filtro-demanda-origen", "FACTURACION");
  await aplicar();
  assert.deepEqual(ultima(), { page: "1", limit: "10", origen: "FACTURACION" });
  assert.equal(ultima().estado, undefined);

  await act(async () => boton("Siguiente").props.onClick());
  assert.deepEqual(ultima(), { page: "2", limit: "10", origen: "FACTURACION" });
});

test("ABC-366 muestra un vacío específico cuando no existen confirmadas", async () => {
  respuesta = (_params, path) => path.endsWith("/planificables")
    ? json({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 })
    : json({ items: [demandaPrueba(1)], total: 1, page: 1, limit: 10, totalPages: 1 });

  await montar();
  await act(async () => boton("Planificables").props.onClick());
  assert.match(texto(), /No se encontraron demandas confirmadas disponibles para planificar/);
});
