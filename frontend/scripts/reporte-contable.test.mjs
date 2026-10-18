import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MAX_CAUSA_RECHAZO_RESUMIDA, resumenReporteContable } from "../src/utils/format.js";

// `reporteContable` tal como lo devuelve nuestra API en el cierre NUEVA-2.
const enviado = { estado: "ENVIADO", codigoRechazo: null, detalle: null, actualizadoEn: "2026-10-18T13:00:00.000Z" };

test("respuesta tardía: con el simulador detenido el reporte sigue pendiente, nunca RECIBIDO", () => {
  const resumen = resumenReporteContable(enviado);
  assert.equal(resumen.estado, "ENVIADO");
  assert.equal(resumen.pendiente, true);
  assert.equal(resumen.etiqueta, "Enviado · sin respuesta");
  assert.notEqual(resumen.estado, "RECIBIDO");
});

test("sin respuesta registrada, la pantalla no supone un estado", () => {
  for (const reporte of [undefined, null, {}, { estado: "APROBADO" }, { estado: "recibido" }]) {
    const resumen = resumenReporteContable(reporte);
    assert.equal(resumen.estado, null, JSON.stringify(reporte));
    assert.equal(resumen.etiqueta, "Sin estado informado");
    assert.equal(resumen.pendiente, false);
  }
});

test("al llegar RECIBIDO deja de estar pendiente", () => {
  const resumen = resumenReporteContable({ ...enviado, estado: "RECIBIDO", actualizadoEn: "2026-10-18T13:05:00.000Z" });
  assert.equal(resumen.etiqueta, "Recibido");
  assert.equal(resumen.pendiente, false);
  assert.equal(resumen.causaResumida, null);
});

test("RECHAZADO muestra la causa resumida y conserva la completa para consultarla", () => {
  const detalle = "El material HAR-001 no existe en el catálogo contable y el consumo de 23 kg no puede asociarse a ninguna cuenta de inventario vigente.";
  const resumen = resumenReporteContable({ ...enviado, estado: "RECHAZADO", codigoRechazo: "CONSUMO_SIN_MATERIAL", detalle });

  assert.equal(resumen.etiqueta, "Rechazado");
  assert.equal(resumen.causaCompleta, `CONSUMO_SIN_MATERIAL: ${detalle}`);
  assert.ok(resumen.causaResumida.length <= MAX_CAUSA_RECHAZO_RESUMIDA + 1);
  assert.ok(resumen.causaResumida.endsWith("…"));
  assert.ok(resumen.causaResumida.startsWith("CONSUMO_SIN_MATERIAL: El material HAR-001"));
});

test("RECHAZADO corto o sin detalle no inventa texto", () => {
  assert.equal(resumenReporteContable({ estado: "RECHAZADO", codigoRechazo: "VERSION_DUPLICADA" }).causaResumida, "VERSION_DUPLICADA");
  assert.equal(resumenReporteContable({ estado: "RECHAZADO" }).causaCompleta, "Contabilidad no informó la causa.");
});

test("la página no fija RECIBIDO por su cuenta y ofrece consultar la causa", async () => {
  const archivo = await readFile(new URL("../src/pages/OrdenDetallePage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(archivo, /"RECIBIDO"/);
  assert.match(archivo, /resumenReporteContable\(cierre\?\.reporteContable\)/);
  assert.match(archivo, /Consultar causa completa/);
  assert.match(archivo, /Actualizar estado/);
});
