import SelectorRecursosLogisticos from "../SelectorRecursosLogisticos.jsx";
import { formatearCantidad, formatearFecha, formatearFechaHora } from "../../../utils/format.js";

function fechaHora(valor) {
  const { fecha, hora } = formatearFechaHora(valor);
  return `${fecha} ${hora}`;
}

// ABC-372: vehículos y choferes de la fecha elegida con su capacidad, origen y
// vigencia. Elegir no reserva nada: el ERP confirma la asignación al guardar.
export default function RecursosRuta({ fecha, recursos, cargando, error, seleccion, onSeleccionar }) {
  const vehiculo = recursos?.vehiculos.find((fila) => fila.idExterno === seleccion.vehiculo);
  const chofer = recursos?.choferes.find((fila) => fila.idExterno === seleccion.chofer);

  return (
    <>
      {!fecha && <p className="ts-notice" role="status">Elige la fecha para ver los vehículos y choferes.</p>}
      {cargando && <p className="ts-notice" role="status">Consultando el ERP… Si no responde, se usará la última copia de respaldo.</p>}
      {error && <div className="ts-feedback ts-error" role="alert">{error}</div>}

      {recursos && (
        <>
          {recursos.origen === "RESPALDO" ? (
            <div className="recursos-vigencia recursos-vigencia--respaldo" role="alert">
              <span className="ts-badge ts-badge--INSUFICIENTE">Copia de respaldo</span>
              <p>
                {recursos.aviso.mensaje} Copia sincronizada el {fechaHora(recursos.sincronizadoEn)}. Verifica la
                disponibilidad antes de confirmar la ruta.
              </p>
            </div>
          ) : (
            <div className="recursos-vigencia recursos-vigencia--erp" role="status">
              <span className="ts-badge ts-badge--DISPONIBLE">Datos del ERP</span>
              <p>Recursos del {formatearFecha(recursos.fecha)} consultados el {fechaHora(recursos.sincronizadoEn)}.</p>
            </div>
          )}
          <SelectorRecursosLogisticos
            vehiculos={recursos.vehiculos}
            choferes={recursos.choferes}
            totales={recursos.totales}
            seleccion={seleccion}
            onSeleccionar={onSeleccionar}
          />
        </>
      )}

      {(seleccion.vehiculo || seleccion.chofer) && (
        <div className="ts-panel recursos-seleccion" aria-live="polite">
          <div className="ts-panel-title"><h2>Asignación elegida</h2></div>
          <dl>
            <dt>Vehículo</dt>
            <dd>
              {vehiculo
                ? `${vehiculo.idExterno} · ${vehiculo.placa} · capacidad ${formatearCantidad(vehiculo.capacidad.valor, vehiculo.capacidad.unidad)}`
                : seleccion.vehiculo || "Sin elegir"}
            </dd>
            <dt>Chofer</dt>
            <dd>{chofer ? `${chofer.idExterno} · ${chofer.nombre}` : seleccion.chofer || "Sin elegir"}</dd>
          </dl>
          {((seleccion.vehiculo && !vehiculo) || (seleccion.chofer && !chofer)) && (
            <p className="ts-field-help">
              Algún recurso elegido no aparece entre los de esta fecha. Se validará al guardar y puedes cambiarlo.
            </p>
          )}
        </div>
      )}
    </>
  );
}
