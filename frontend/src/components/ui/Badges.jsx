import { formatearDisponibilidad, formatearEstadoOrden, formatearNumero } from "../../utils/format.js";

export function BadgeEstadoOrden({ estado }) {
  const clave = estado ?? "DESCONOCIDO";
  return (
    <span className={`ts-badge ts-badge--${clave}`}>
      {formatearEstadoOrden(estado)}
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
  return <span className={`ts-badge ts-badge--${estado}`}>{formatearDisponibilidad(estado)}</span>;
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
      <span>{formatearNumero(hecho)} / {formatearNumero(total)}</span>
    </span>
  );
}

const SEMAFORO = {
  VERDE: { icono: "✓", texto: "En meta" },
  AMARILLO: { icono: "!", texto: "Cerca de la meta" },
  ROJO: { icono: "✕", texto: "Fuera de meta" },
};

// ABC-497: el color siempre va con ícono y texto; sin color del backend no se pinta nada.
export function BadgeSemaforo({ color }) {
  const info = SEMAFORO[color];
  if (!info) return null;
  return (
    <span className={`ts-badge ts-badge--${color}`}>
      <span aria-hidden="true">{info.icono}</span>{info.texto}
    </span>
  );
}
