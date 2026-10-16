import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la comparación se actualiza después de registrar un consumo", async () => {
  const archivo = await readFile(
    new URL("../src/pages/OrdenDetallePage.jsx", import.meta.url),
    "utf8"
  );

  assert.match(archivo, /await registrarConsumo\(/);
  assert.match(archivo, /listarConsumosOrden\(id\)/);
  assert.match(archivo, /obtenerTotalesConsumos\(id\)/);
  assert.match(archivo, /setConsumos\(/);
  assert.match(archivo, /setTotalesConsumo\(/);
  assert.match(archivo, /const desviacion = consumido - requerido/);
});
