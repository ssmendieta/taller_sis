import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { obtenerRuta, PERMISO_CONSULTAR_RUTAS } from "../services/historialLogisticoService.js";
import { PERMISO_CONSULTAR_BOLETAS } from "../services/boletasService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { BadgeEstadoRuta } from "../components/logistica/historial/TablaHistorialRutas.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// Detalle básico de una ruta abierta desde el historial (ABC-392). Entregas e
// incidencias se completarán en ABC-393 cuando existan sus módulos.
export default function RutaDetallePage() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const puedeVerBoletas = tienePermiso(usuario, PERMISO_CONSULTAR_BOLETAS);
  const [ruta, setRuta] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    document.title = FORMATO_TITULO(`Ruta #${id}`);
    setRuta(null);
    setError("");
    obtenerRuta(id)
      .then((datos) => { if (vigente) setRuta(datos); })
      .catch((fallo) => { if (vigente) setError(fallo.status === 404 ? "La ruta no existe." : fallo.message); });
    return () => { vigente = false; };
  }, [id]);

  if (!tienePermiso(usuario, PERMISO_CONSULTAR_RUTAS)) {
    return <p className="ts-feedback ts-error" role="alert">No tienes permiso para consultar rutas.</p>;
  }

  const volver = <Link className="ts-btn" to="/logistica/rutas/historial">Volver al historial</Link>;
  if (error) {
    return (
      <section className="ts-page">
        <PageHeader titulo={`Ruta #${id}`} accion={volver} />
        <p className="ts-modal-error" role="alert">{error}</p>
      </section>
    );
  }
  if (!ruta) return <p className="ts-empty">Cargando ruta…</p>;

  const paradas = [...(ruta.paradas ?? [])].sort((a, b) => a.secuencia - b.secuencia);
  return (
    <section className="ts-page" aria-labelledby="ruta-detalle-titulo">
      <PageHeader titulo={`Ruta #${ruta.id}`} descripcion="Detalle de solo lectura." accion={volver} />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="ruta-detalle-titulo">Datos generales</h2>
          <BadgeEstadoRuta estado={ruta.estado} />
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", padding: "12px 20px" }}>
          <dt>Fecha programada</dt><dd>{ruta.fechaProgramada}</dd>
          <dt>Vehículo</dt><dd>{ruta.vehiculoExternoId}</dd>
          <dt>Chofer</dt><dd>{ruta.choferExternoId}</dd>
        </dl>
      </div>

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2>Paradas y boletas</h2>
          <span>{paradas.length} paradas</span>
        </div>
        {paradas.length === 0 ? (
          <p className="ts-empty">La ruta no tiene paradas registradas.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Paradas de la ruta en orden de visita</caption>
              <thead>
                <tr>
                  <th scope="col">N.º</th>
                  <th scope="col">Destino</th>
                  <th scope="col">Entrega</th>
                  <th scope="col">Boletas</th>
                </tr>
              </thead>
              <tbody>
                {paradas.map((parada) => (
                  <tr key={parada.id}>
                    <td>{parada.secuencia}</td>
                    <td>{parada.destino}</td>
                    <td>{parada.estadoEntrega ?? "—"}</td>
                    <td>
                      {(parada.boletas ?? []).map((documento, indice) => (
                        <span key={documento.id}>
                          {indice > 0 && ", "}
                          {puedeVerBoletas
                            ? <Link to={`/logistica/boletas/${documento.boletaId}`}>Boleta {documento.boletaId}</Link>
                            : `Boleta ${documento.boletaId}`}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
