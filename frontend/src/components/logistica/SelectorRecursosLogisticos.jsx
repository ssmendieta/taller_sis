import { formatearCantidad } from "../../utils/format.js";

function Estado({ disponible }) {
  return (
    <span className={`ts-badge ${disponible ? "ts-badge--DISPONIBLE" : "ts-badge--inactivo"}`}>
      {disponible ? "Disponible" : "No disponible"}
    </span>
  );
}

function Elegir({ tipo, recurso, elegido, onSeleccionar }) {
  const nombre = tipo === "vehiculo" ? "vehículo" : "chofer";
  return (
    <input
      type="radio"
      name={`recurso-${tipo}`}
      checked={elegido === recurso.idExterno}
      disabled={!recurso.disponible}
      title={recurso.disponible ? undefined : "No disponible: no se ofrece para asignar"}
      aria-label={`Elegir ${nombre} ${recurso.idExterno}`}
      onChange={() => onSeleccionar(tipo, recurso.idExterno)}
    />
  );
}

// ABC-353: listado de vehículos y choferes con selección para planificar una
// ruta. Solo se eligen recursos disponibles y elegir no los reserva.
export default function SelectorRecursosLogisticos({ vehiculos, choferes, totales, seleccion, onSeleccionar }) {
  return (
    <div className="recursos-selector">
      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2>Vehículos</h2>
          <span>{vehiculos.length} de {totales.vehiculos}</span>
        </div>
        {vehiculos.length === 0 ? (
          <p className="ts-empty">Ningún vehículo cumple los filtros para esta fecha.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <thead>
                <tr>
                  <th scope="col">Elegir</th>
                  <th scope="col">Vehículo</th>
                  <th scope="col">Placa</th>
                  <th scope="col">Descripción</th>
                  <th scope="col">Capacidad</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {vehiculos.map((vehiculo) => (
                  <tr key={vehiculo.idExterno}>
                    <td><Elegir tipo="vehiculo" recurso={vehiculo} elegido={seleccion.vehiculo} onSeleccionar={onSeleccionar} /></td>
                    <td><span className="ts-code">{vehiculo.idExterno}</span></td>
                    <td>{vehiculo.placa}</td>
                    <td>{vehiculo.descripcion ?? "—"}</td>
                    <td>{formatearCantidad(vehiculo.capacidad.valor, vehiculo.capacidad.unidad)}</td>
                    <td><Estado disponible={vehiculo.disponible} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2>Choferes</h2>
          <span>{choferes.length} de {totales.choferes}</span>
        </div>
        {choferes.length === 0 ? (
          <p className="ts-empty">Ningún chofer cumple los filtros para esta fecha.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <thead>
                <tr>
                  <th scope="col">Elegir</th>
                  <th scope="col">Chofer</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Licencia</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {choferes.map((chofer) => (
                  <tr key={chofer.idExterno}>
                    <td><Elegir tipo="chofer" recurso={chofer} elegido={seleccion.chofer} onSeleccionar={onSeleccionar} /></td>
                    <td><span className="ts-code">{chofer.idExterno}</span></td>
                    <td>{chofer.nombre}</td>
                    <td>{chofer.licenciaCategoria ?? "—"}</td>
                    <td><Estado disponible={chofer.disponible} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
