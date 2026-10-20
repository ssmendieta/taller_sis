import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { listarBoletas, PERMISO_CONSULTAR_SOLICITUDES, PERMISO_GESTIONAR_SOLICITUDES } from "../services/boletasService.js";
import { formatearFechaHora } from "../utils/format.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// Cada estado documental con su propio color: las anuladas no se confunden con las emitidas.
const ESTADOS = {
  BORRADOR: { texto: "Borrador", clase: "ts-badge--PLANIFICADA" },
  EMITIDA: { texto: "Emitida", clase: "ts-badge--FINALIZADA" },
  ANULADA: { texto: "Anulada", clase: "ts-badge--CANCELADA" },
};

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar boletas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudieron cargar las boletas.";
}

export default function BoletasPage() {
  const { usuario } = useSesion();
  const [boletas, setBoletas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargar() {
    setCargando(true);
    setError("");

    try {
      const respuesta = await listarBoletas();
      setBoletas(Array.isArray(respuesta) ? respuesta : Array.isArray(respuesta?.items) ? respuesta.items : []);
    } catch (fallo) {
      setBoletas([]);
      setError(mensajeError(fallo));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    document.title = FORMATO_TITULO("Boletas");
  }, []);

  return (
    <section className="ts-page" aria-labelledby="boletas-titulo">
      <PageHeader
        titulo="Boletas de envío"
        descripcion="Documentos de salida generados desde solicitudes de salida."
        conteo={!cargando && !error ? `${boletas.length} ${boletas.length === 1 ? "boleta" : "boletas"}` : null}
        accion={<div className="ts-btn-group">
          {(tienePermiso(usuario, PERMISO_CONSULTAR_SOLICITUDES) || tienePermiso(usuario, PERMISO_GESTIONAR_SOLICITUDES)) && <Link className="ts-btn" to="/logistica/inicio">Solicitudes de salida</Link>}
          {tienePermiso(usuario, "logistica.boletas.gestionar") && <Link className="ts-btn ts-btn-primary" to="/logistica/boletas/nueva">Crear boleta</Link>}
        </div>}
      />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="boletas-titulo">Boletas</h2>
        </div>

        {cargando ? (
          <p className="ts-feedback" role="status">Cargando boletas…</p>
        ) : error ? (
          <div className="ts-feedback ts-error" role="alert">
            <p>{error}</p>
            <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
          </div>
        ) : boletas.length === 0 ? (
          <p className="ts-empty">Todavía no hay boletas registradas.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Boletas de envío guardadas</caption>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Solicitud de salida</th>
                  <th scope="col" className="ts-num">Ítems</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {boletas.map((b) => {
                  const estado = ESTADOS[b.estado];
                  const { fecha, hora } = formatearFechaHora(b.creadoEn);

                  return (
                    <tr key={b.id}>
                      <td className="ts-code">{b.numero}</td>
                      <td>
                        <span className={`ts-badge ${estado?.clase ?? "ts-badge--inactivo"}`}>
                          {estado?.texto ?? b.estado}
                        </span>
                      </td>
                      <td>#{b.solicitudSalidaId}</td>
                      <td className="ts-num">{Array.isArray(b.items) ? b.items.length : "—"}</td>
                      <td>{fecha} {hora}</td>
                      <td>
                        <Link className="ts-btn ts-btn--sm" to={`/logistica/boletas/${b.id}`}>
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
