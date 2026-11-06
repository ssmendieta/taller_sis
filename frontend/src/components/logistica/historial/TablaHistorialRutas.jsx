import { Link } from "react-router-dom";
import { ESTADOS_RUTA } from "../../../services/historialLogisticoService.js";

function fechaLegible(valor) {
  const [anio, mes, dia] = String(valor).split("-");
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : valor;
}

export function BadgeEstadoRuta({ estado }) {
  const info = ESTADOS_RUTA[estado] ?? { texto: estado, clase: "" };
  return <span className={`ts-badge ${info.clase}`}>{info.texto}</span>;
}

export default function TablaHistorialRutas({ rutas }) {
  return (
    <div className="ts-table-wrap">
      <table className="ts-table">
        <caption>Rutas ordenadas de la fecha más reciente a la más antigua</caption>
        <thead>
          <tr>
            <th scope="col">Ruta</th>
            <th scope="col">Fecha programada</th>
            <th scope="col">Estado</th>
            <th scope="col">Vehículo</th>
            <th scope="col">Chofer</th>
            <th scope="col">Paradas</th>
            <th scope="col">Boletas</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rutas.map((ruta) => (
            <tr key={ruta.id}>
              <td>#{ruta.id}</td>
              <td>{fechaLegible(ruta.fechaProgramada)}</td>
              <td><BadgeEstadoRuta estado={ruta.estado} /></td>
              <td>{ruta.vehiculoExternoId}</td>
              <td>{ruta.choferExternoId}</td>
              <td>{ruta.totalParadas}</td>
              <td>{ruta.totalBoletas}</td>
              <td><Link className="ts-btn ts-btn--sm" to={`/logistica/rutas/${ruta.id}`}>Ver ruta</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
