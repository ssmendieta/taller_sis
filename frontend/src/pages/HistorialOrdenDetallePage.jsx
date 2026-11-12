import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { consultarEventosOrden, PERMISO_HISTORIAL_PRODUCCION } from "../services/historialProduccionService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { BadgeEstadoOrden } from "../components/ui/Badges.jsx";
import CronologiaOrden from "../components/produccion/historial/CronologiaOrden.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";
import "../styles/cronologia-orden.css";

function mensajeError(fallo) {
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  if (fallo?.status === 403) return "No tienes permiso para consultar la cronología de producción.";
  if (fallo?.status === 404) return "La orden de producción no existe.";
  return fallo?.message || "No se pudo cargar la cronología de la orden.";
}

export default function HistorialOrdenDetallePage() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const puedeConsultar = tienePermiso(usuario, PERMISO_HISTORIAL_PRODUCCION);
  const [respuesta, setRespuesta] = useState(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    document.title = FORMATO_TITULO(`Cronología de la orden #${id}`);
    if (!puedeConsultar) return;
    const control = new AbortController();
    setRespuesta(null);
    consultarEventosOrden(id, { signal: control.signal })
      .then((datos) => {
        if (!control.signal.aborted) setRespuesta({ id, datos });
      })
      .catch((fallo) => {
        if (!control.signal.aborted) setRespuesta({ id, error: mensajeError(fallo) });
      });
    return () => control.abort();
  }, [id, puedeConsultar, intento]);

  const actual = respuesta?.id === id ? respuesta : null;
  return (
    <section className="ts-page" aria-busy={puedeConsultar && !actual}>
      <PageHeader titulo="Cronología de producción"
        descripcion="Estados, avances, calidad, pérdidas, observaciones, lotes y reprocesos de la orden."
        accion={<Link className="ts-btn" to="/produccion/historial">Volver al historial</Link>} />

      {!puedeConsultar ? (
        <p className="ts-feedback ts-error" role="alert">No tienes permiso para consultar la cronología de producción.</p>
      ) : !actual ? (
        <p role="status">Cargando eventos de la orden…</p>
      ) : actual.error ? (
        <div className="ts-feedback ts-error" role="alert">
          <p>{actual.error}</p>
          <button type="button" className="ts-btn" onClick={() => setIntento((valor) => valor + 1)}>Reintentar</button>
        </div>
      ) : (
        <div className="ts-panel">
          <div className="cronologia-orden__cabecera">
            <h2>{actual.datos.orden.codigo}</h2>
            <BadgeEstadoOrden estado={actual.datos.orden.estado} />
            <Link className="ts-btn" to={`/ordenes/${id}`}>Abrir orden</Link>
          </div>
          <CronologiaOrden eventos={actual.datos.eventos} />
        </div>
      )}
    </section>
  );
}
