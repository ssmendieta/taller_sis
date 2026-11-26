import { useState } from "react";
import { Link } from "react-router-dom";

const formato = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const pct = (v) => `${formato.format(v)}%`;

// ABC-423 (CA-03): uso de capacidad del período, por vehículo. Una sola tonalidad;
// la barra se escala a 100 % (o al mayor valor si hay sobrecarga) y lleva su número.
export default function WidgetUsoCapacidad({ uso, periodo }) {
  const [activa, setActiva] = useState(null);
  const [verTabla, setVerTabla] = useState(false);
  const vehiculos = uso.por_vehiculo;
  const escala = Math.max(100, ...vehiculos.map((v) => v.porcentaje ?? 0));
  const consulta = new URLSearchParams(Object.entries(periodo).filter(([, v]) => v)).toString();
  const nombre = (v) => v.placa ?? v.vehiculo_externo_id;
  const resumen = vehiculos.map((v) => `${nombre(v)}: ${v.porcentaje === null ? "no calculable" : pct(v.porcentaje)}`).join(", ");

  return (
    <figure className="dash-grafico" aria-labelledby="dash-uso-titulo">
      <figcaption className="dash-grafico-cabecera">
        <h3 id="dash-uso-titulo">Uso de capacidad</h3>
        <span className="dash-grafico-total">{uso.porcentaje === null ? "Sin datos" : pct(uso.porcentaje)}</span>
      </figcaption>

      {vehiculos.length === 0 ? (
        <p className="ts-empty">Sin rutas despachadas en el período.</p>
      ) : verTabla ? (
        <table className="ts-table dash-tabla">
          <caption className="sr-solo">Uso de capacidad por vehículo</caption>
          <thead>
            <tr><th scope="col">Vehículo</th><th scope="col" className="ts-num">Uso</th><th scope="col" className="ts-num">Rutas</th><th scope="col" className="ts-num">No calculables</th></tr>
          </thead>
          <tbody>
            {vehiculos.map((v) => (
              <tr key={v.vehiculo_externo_id}>
                <td>{nombre(v)}</td>
                <td className="ts-num">{v.porcentaje === null ? "No calculable" : pct(v.porcentaje)}</td>
                <td className="ts-num">{v.rutas_calculables}</td>
                <td className="ts-num">{v.rutas_no_calculables}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="dash-barras" role="img" aria-label={`Uso de capacidad por vehículo. ${resumen}.`}>
          {vehiculos.map((v) => (
            <li key={v.vehiculo_externo_id} className="dash-barra-fila" data-activa={activa === v.vehiculo_externo_id || undefined}
              onMouseEnter={() => setActiva(v.vehiculo_externo_id)} onMouseLeave={() => setActiva(null)}>
              <span className="dash-barra-etiqueta">{nombre(v)}</span>
              <span className="dash-barra-pista">
                {v.porcentaje !== null && v.porcentaje > 0 && (
                  <span className="dash-barra" style={{ width: `${Math.max((v.porcentaje / escala) * 100, 1.5)}%` }} />
                )}
                <span className="dash-barra-valor">{v.porcentaje === null ? "No calculable" : pct(v.porcentaje)}</span>
              </span>
              {activa === v.vehiculo_externo_id && (
                <span className="dash-tooltip" role="tooltip">
                  {`${nombre(v)}: ${v.rutas_calculables} rutas calculables, ${v.rutas_no_calculables} no calculables`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {uso.rutas_no_calculables > 0 && (
        <p className="dash-nota">{`${uso.rutas_no_calculables} ${uso.rutas_no_calculables === 1 ? "ruta no es calculable" : "rutas no son calculables"} (unidades distintas o sin capacidad); no se convierten ni se estiman.`}</p>
      )}
      <div className="ts-btn-group">
        {vehiculos.length > 0 && (
          <button type="button" className="ts-btn ts-btn--sm" onClick={() => setVerTabla((x) => !x)}>{verTabla ? "Ver gráfico" : "Ver tabla"}</button>
        )}
        <Link className="ts-btn ts-btn--sm" to={`/logistica/kpis/USO_CAPACIDAD${consulta ? `?${consulta}` : ""}`}>Ver rutas</Link>
      </div>
    </figure>
  );
}
