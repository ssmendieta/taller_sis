import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatearDiferencia } from "../src/utils/format.js";

test("la comparación se recarga desde la API después de registrar un consumo", async () => {
  const archivo = await readFile(
    new URL("../src/pages/OrdenDetallePage.jsx", import.meta.url),
    "utf8"
  );

  assert.match(archivo, /await registrarConsumo\(/);
  assert.match(archivo, /listarConsumosOrden\(id\)/);
  assert.match(archivo, /cargarComparacion\(\)/);
  assert.match(archivo, /obtenerComparacionMateriales\(id\)/);
  assert.match(archivo, /setComparacion\(/);
  // ABC-72: la diferencia la calcula el backend; la pantalla no resta cantidades.
  assert.doesNotMatch(archivo, /consumido - requerido/);
  assert.match(archivo, /Diferencia \(utilizado − requerido\)/);
});

test("la diferencia muestra el signo y la unidad", () => {
  assert.equal(formatearDiferencia("3.0000", "kg"), "+3 kg");
  assert.equal(formatearDiferencia("-2.5000", "kg"), "-2,5 kg");
  assert.equal(formatearDiferencia("0.0000", "kg"), "0 kg");
  assert.equal(formatearDiferencia("-0.0000", "kg"), "0 kg");
  assert.equal(formatearDiferencia(null, "kg"), "—");
});
