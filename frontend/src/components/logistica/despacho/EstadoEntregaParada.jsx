import { formatearFechaHora } from "../../../utils/format.js";

export const ESTADOS_ENTREGA = {
  PENDIENTE: { texto: "Pendiente", clase: "ts-badge--PENDIENTE" },
  ENTREGADA: { texto: "Entregada", clase: "ts-badge--FINALIZADA" },
  ANULADA: { texto: "Anulada", clase: "ts-badge--CANCELADA" },
};

export function fechaHora(valor) {
  const { fecha, hora } = formatearFechaHora(valor);
  return `${fecha} ${hora}`;
}

// ABC-377: estado de entrega de una parada con fecha, autor y observación.
export default function EstadoEntregaParada({ parada }) {
  const info = ESTADOS_ENTREGA[parada.estadoEntrega] ?? { texto: parada.estadoEntrega ?? "—", clase: "" };
  return (
    <div className="despacho-entrega">
      <span className={`ts-badge ${info.clase}`}>{info.texto}</span>
      {parada.entregaActualizadaEn && (
        <span className="despacho-detalle">
          {fechaHora(parada.entregaActualizadaEn)} · usuario #{parada.entregaUsuarioId}
        </span>
      )}
      {parada.entregaObservacion && <span className="despacho-detalle">“{parada.entregaObservacion}”</span>}
    </div>
  );
}
