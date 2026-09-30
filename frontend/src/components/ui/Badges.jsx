import { mostrarEstadoOrden } from "../../utils/formato.js";

export function BadgeEstadoOrden({ estado }) {
  const clave = estado ?? "DESCONOCIDO";
  return (
    <span className={`ts-badge ts-badge--${clave}`}>
      {mostrarEstadoOrden(estado)}
    </span>
  );
}

export function BadgeActivo({ activo }) {
  return (
    <span className={`ts-badge ${activo ? "ts-badge--activo" : "ts-badge--inactivo"}`}>
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

export function BadgeDisponibilidad({ estado }) {
  if (!estado) return <span>—</span>;
  return <span className={`ts-badge ts-badge--${estado}`}>{String(estado).replaceAll("_", " ")}</span>;
}

export function BarraAvance({ acumulado = 0, solicitada = 0 }) {
  const total = Number(solicitada);
  const hecho = Number(acumulado);
  const porcentaje = Number.isFinite(total) && total > 0 && Number.isFinite(hecho)
    ? Math.min(100, Math.max(0, (hecho / total) * 100))
    : 0;
  return (
    <span className="ts-progress" role="img" aria-label={`Avance ${hecho} de ${total}`}>
      <span className="ts-progress-track" aria-hidden="true">
        <span
          className={`ts-progress-fill${porcentaje >= 100 ? " ts-progress-fill--lleno" : ""}`}
          style={{ width: `${porcentaje}%` }}
        />
      </span>
      <span>{hecho} / {total}</span>
    </span>
  );
}
