import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filasComparacionMateriales } from "../src/utils/format.js";

// Respuestas de GET /api/produccion/ordenes/:id/comparacion-materiales (ABC-72)
// para la receta de prueba: 20 kg de harina, 5 l de leche y 200 huevos.
const material = (materialId, materialCodigo, materialNombre, unidad, cantidadRequerida, cantidadConsumida, diferencia) =>
  ({ materialId, materialCodigo, materialNombre, unidad, cantidadRequerida, cantidadConsumida, diferencia });

const columnas = (filas) => filas.map((f) => [f.requerido, f.utilizado, f.diferencia]);

test("orden sin consumo: utilizado cero en cada material, con su unidad", () => {
  const filas = filasComparacionMateriales([
    material("1", "HAR-001", "Harina", "kg", "20.0000", "0.0000", "-20.0000"),
    material("2", "LEC-001", "Leche", "l", "5.0000", "0.0000", "-5.0000"),
    material("3", "HUE-001", "Huevo", "unidad", "200.0000", "0.0000", "-200.0000"),
  ]);

  assert.deepEqual(columnas(filas), [
    ["20 kg", "0 kg", "-20 kg"],
    ["5 l", "0 l", "-5 l"],
    ["200 unidad", "0 unidad", "-200 unidad"],
  ]);
});

test("varios materiales: cada fila conserva su unidad y el signo de la diferencia", () => {
  const filas = filasComparacionMateriales([
    material("1", "HAR-001", "Harina", "kg", "20.0000", "23.0000", "3.0000"),
    material("2", "LEC-001", "Leche", "l", "5.0000", "4.5000", "-0.5000"),
    material("3", "HUE-001", "Huevo", "unidad", "200.0000", "200.0000", "0.0000"),
  ]);

  assert.deepEqual(columnas(filas), [
    ["20 kg", "23 kg", "+3 kg"],
    ["5 l", "4,5 l", "-0,5 l"],
    ["200 unidad", "200 unidad", "0 unidad"],
  ]);
  // Sin mezclas: ninguna cifra lleva la unidad de otro material.
  for (const [indice, unidad] of ["kg", "l", "unidad"].entries()) {
    for (const celda of columnas(filas)[indice]) assert.ok(celda.endsWith(` ${unidad}`), celda);
  }
});

test("no inventa cifras: un dato ausente se muestra «—» y una lista inválida no crea filas", () => {
  const [fila] = filasComparacionMateriales([
    { materialId: "1", materialCodigo: "HAR-001", materialNombre: "Harina", unidad: "kg", cantidadRequerida: "20.0000" },
  ]);
  assert.equal(fila.utilizado, "—");
  assert.equal(fila.diferencia, "—");
  assert.deepEqual(filasComparacionMateriales(undefined), []);
  assert.deepEqual(filasComparacionMateriales({ message: "Conflict" }), []);
});

test("un consumo fuera de la receta se marca y su requerido es 0, no uno inventado", () => {
  const [fila] = filasComparacionMateriales([
    material("4", "SAL-001", "Sal", "kg", "0.0000", "1.5000", "1.5000"),
  ]);
  assert.equal(fila.fueraDeReceta, true);
  assert.deepEqual([fila.requerido, fila.utilizado, fila.diferencia], ["0 kg", "1,5 kg", "+1,5 kg"]);
});

test("con unidades incompatibles (409) la página no muestra cifras", async () => {
  const archivo = await readFile(new URL("../src/pages/OrdenDetallePage.jsx", import.meta.url), "utf8");
  assert.match(archivo, /fallo\.status === 409/);
  assert.match(archivo, /setComparacion\(\[\]\)/);
  assert.match(archivo, /Comparación no disponible\./);
});
