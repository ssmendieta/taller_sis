import { Link } from "react-router-dom";
import { BadgeEstadoOrden } from "../../ui/Badges.jsx";
import Paginacion from "../../ui/Paginacion.jsx";
import { formatearCantidad, formatearFecha } from "../../../utils/format.js";

export default function TablaHistorialProduccion({
  items = [],
  total = 0,
  page = 1,
  totalPages = 1,
  alCambiarPagina,
}) {
  if (!items.length) {
    return (
      <div className="ts-empty" role="status">
        <p>No se encontraron órdenes para los criterios aplicados.</p>
      </div>
    );
  }

  return (
    <div className="ts-table-wrapper" aria-label="Historial de órdenes de producción">
      <div className="ts-table-meta" style={{ padding: "8px 12px", color: "#666", fontSize: "0.9rem" }}>
        <span>
          Mostrando {items.length} de {total} {total === 1 ? "orden encontrada" : "órdenes encontradas"}
        </span>
      </div>

      <table className="ts-table" role="table">
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Producto</th>
            <th scope="col">Cantidad</th>
            <th scope="col">Fecha Programada</th>
            <th scope="col">Estado</th>
            <th scope="col">Responsable</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((orden) => {
            const nombreProd = orden.producto_nombre
              ? `${orden.producto_nombre}${orden.producto_codigo ? ` (${orden.producto_codigo})` : ""}`
              : `Producto #${orden.producto_id}`;

            return (
              <tr key={orden.id}>
                <td>
                  <strong>{orden.codigo || `OP-${orden.id}`}</strong>
                </td>
                <td>{nombreProd}</td>
                <td>
                  {formatearCantidad(orden.cantidad_solicitada, orden.unidad_producto)}
                </td>
                <td>{formatearFecha(orden.fecha_programada)}</td>
                <td>
                  <BadgeEstadoOrden estado={orden.estado} />
                </td>
                <td>{orden.responsable_nombre || `Usuario #${orden.responsable_usuario_id}`}</td>
                <td>
                  <Link
                    to={`/ordenes/${orden.id}`}
                    className="ts-btn ts-btn--sm"
                    title={`Ver detalle de la orden ${orden.codigo || orden.id}`}
                  >
                    Ver detalle
                  </Link>
                  {" "}
                  <Link to={`/produccion/historial/ordenes/${orden.id}`} className="ts-btn ts-btn--sm"
                    title={`Ver cronología de la orden ${orden.codigo || orden.id}`}>
                    Ver cronología
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{ marginTop: "16px" }}>
          <Paginacion
            pagina={page}
            total={totalPages}
            alCambiar={alCambiarPagina}
            etiqueta="Paginación del historial de producción"
          />
        </div>
      )}
    </div>
  );
}
