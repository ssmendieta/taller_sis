import test from "node:test";
import assert from "node:assert/strict";
import {
  cantidadAutorizadaPorSolicitud,
  cantidadSugerida,
  escalarCantidad,
  formatearEscalada,
  saldoDeLote,
  validarCantidadContraSolicitud,
  validarCantidadLote,
} from "../src/services/saldosLotes.js";

// Saldos que devuelve el backend: LOTE-001 tiene 60 unidades de las cuales 20 ya
// están comprometidas en boletas EMITIDAS; LOTE-002 está agotado.
const saldos = [
  {
    referencia: "LOTE-001",
    cantidadOriginal: "60.0000",
    cantidadComprometida: "20.0000",
    cantidadDisponible: "40.0000",
  },
  {
    referencia: "LOTE-002",
    cantidadOriginal: "40.0000",
    cantidadComprometida: "40.0000",
    cantidadDisponible: "0.0000",
  },
];

test("el saldo del lote reproduce la disponibilidad real del backend", () => {
  const saldo = saldoDeLote(saldos, "LOTE-001");
  assert.equal(saldo.cantidadOriginal, "60.0000");
  assert.equal(saldo.cantidadComprometida, "20.0000");
  assert.equal(saldo.cantidadDisponible, "40.0000");
  assert.equal(saldoDeLote(saldos, "LOTE-999"), null);
});

test("las cantidades se comparan con precisión de cuatro decimales", () => {
  assert.equal(escalarCantidad("60.0000"), 600000n);
  assert.equal(escalarCantidad("12.5"), 125000n);
  assert.equal(escalarCantidad("abc"), null);
  assert.equal(formatearEscalada(400000n), "40");
  assert.equal(formatearEscalada(400050n), "40.005");
});

test("la cantidad precargada es toda la disponibilidad del lote", () => {
  assert.equal(cantidadSugerida(saldoDeLote(saldos, "LOTE-001")), "40");
  assert.equal(cantidadSugerida(saldoDeLote(saldos, "LOTE-002")), "");
  assert.equal(cantidadSugerida(null), "");
});

test("el usuario puede reducir manualmente la cantidad precargada", () => {
  const revision = validarCantidadLote("15", saldoDeLote(saldos, "LOTE-001"), "LOTE-001");
  assert.equal(revision.valido, true);
  assert.equal(revision.mensaje, "");
});

test("no se puede solicitar más de lo disponible en el lote", () => {
  const revision = validarCantidadLote("50", saldoDeLote(saldos, "LOTE-001"), "LOTE-001");
  assert.equal(revision.valido, false);
  assert.match(revision.mensaje, /supera las unidades disponibles/);
});

test("la cantidad debe ser positiva", () => {
  const saldo = saldoDeLote(saldos, "LOTE-001");
  assert.equal(validarCantidadLote("0", saldo, "LOTE-001").valido, false);
  assert.equal(validarCantidadLote("", saldo, "LOTE-001").valido, false);
  assert.equal(validarCantidadLote("abc", saldo, "LOTE-001").valido, false);
});

test("un lote sin disponibilidad no admite una cantidad", () => {
  const revision = validarCantidadLote("1", saldoDeLote(saldos, "LOTE-002"), "LOTE-002");
  assert.equal(revision.valido, false);
  assert.match(revision.mensaje, /no tiene unidades disponibles/);
});

test("la boleta no puede superar lo autorizado por su solicitud de salida", () => {
  const items = [{ referencia: "LOTE-001", cantidad: "30.0000" }];
  assert.equal(cantidadAutorizadaPorSolicitud(items, "LOTE-001"), 300000n);
  assert.equal(cantidadAutorizadaPorSolicitud(items, "LOTE-002"), 0n);
  assert.equal(validarCantidadContraSolicitud("30", items, "LOTE-001").valido, true);
  assert.equal(validarCantidadContraSolicitud("31", items, "LOTE-001").valido, false);
  assert.equal(validarCantidadContraSolicitud("10", [], "LOTE-001").valido, false);
});
