import test from "node:test";
import assert from "node:assert/strict";
import { diaAuditoria, filtrarAuditoria, paginaAuditoria } from "../src/services/auditoriaFiltros.js";

const eventos = [
  { id: "1", usuario_actor_nombre: "Ana", usuario_afectado_nombre: "Pedro", accion: "CREAR_USUARIO", fecha_hora: "2026-09-28T02:00:00Z" },
  { id: "2", usuario_actor_nombre: "Lucía", usuario_afectado_nombre: "Ana", accion: "DESACTIVAR_USUARIO", fecha_hora: "2026-09-28T16:00:00Z" },
  { id: "3", usuario_actor_nombre: "Ana", usuario_afectado_nombre: "Pablo", accion: "CREAR_USUARIO", fecha_hora: "2026-09-29T16:00:00Z" },
];

test("ABC-186 filtra por actor o afectado, ignorando mayúsculas", () => {
  assert.deepEqual(filtrarAuditoria(eventos, { usuario: "ANA" }).map((e) => e.id), ["3", "2", "1"]);
  assert.deepEqual(filtrarAuditoria(eventos, { usuario: "PEDRO" }).map((e) => e.id), ["1"]);
});

test("ABC-186 combina acción y rango de fechas en hora boliviana", () => {
  assert.equal(diaAuditoria(eventos[0].fecha_hora), "2026-09-27");
  assert.deepEqual(filtrarAuditoria(eventos, {
    accion: "CREAR_USUARIO", desde: "2026-09-28", hasta: "2026-09-29",
  }).map((e) => e.id), ["3"]);
  assert.deepEqual(filtrarAuditoria(eventos, { desde: "2026-09-27", hasta: "2026-09-27" })
    .map((e) => e.id), ["1"]);
});

test("ABC-186 pagina después de filtrar sin perder el orden", () => {
  const filtrados = filtrarAuditoria(eventos, { usuario: "ana" });
  assert.deepEqual(paginaAuditoria(filtrados, 2, 1).map((e) => e.id), ["2"]);
});
