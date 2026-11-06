import { useCallback, useEffect, useRef, useState } from "react";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { listarHistorialRutas, PERMISO_CONSULTAR_RUTAS } from "../services/historialLogisticoService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import Paginacion from "../components/ui/Paginacion.jsx";
import FiltrosHistorialRutas, { FILTROS_HISTORIAL_INICIALES } from "../components/logistica/historial/FiltrosHistorialRutas.jsx";
import TablaHistorialRutas from "../components/logistica/historial/TablaHistorialRutas.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

const RESULTADO_VACIO = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar rutas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudo cargar el historial de rutas.";
}

// ABC-392: historial logístico de solo lectura; no es dashboard ni reporte.
export default function HistorialLogisticoPage() {
  const { usuario } = useSesion();
  const puedeConsultar = tienePermiso(usuario, PERMISO_CONSULTAR_RUTAS);
  const [resultado, setResultado] = useState(RESULTADO_VACIO);
  const [filtros, setFiltros] = useState(FILTROS_HISTORIAL_INICIALES);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Una respuesta tardía de una consulta anterior no reemplaza a la última.
  const ultimaCarga = useRef(0);

  const cargar = useCallback(async (aplicados, pagina) => {
    if (!puedeConsultar) return;
    const carga = ++ultimaCarga.current;
    setCargando(true);
    setError("");
    try {
      const respuesta = await listarHistorialRutas({ ...aplicados, page: pagina });
      if (!Array.isArray(respuesta?.items)) throw new Error("El servidor devolvió un historial inválido.");
      if (carga === ultimaCarga.current) setResultado(respuesta);
    } catch (fallo) {
      if (carga !== ultimaCarga.current) return;
      setResultado(RESULTADO_VACIO);
      setError(mensajeError(fallo));
    } finally {
      if (carga === ultimaCarga.current) setCargando(false);
    }
  }, [puedeConsultar]);

  useEffect(() => {
    document.title = FORMATO_TITULO("Historial de rutas");
    cargar(FILTROS_HISTORIAL_INICIALES, 1);
    return () => { ultimaCarga.current += 1; };
  }, [cargar]);

  function aplicar(nuevos) {
    setFiltros(nuevos);
    cargar(nuevos, 1);
  }

  if (!puedeConsultar) {
    return <p className="ts-feedback ts-error" role="alert">No tienes permiso para consultar rutas.</p>;
  }

  const conteo = `${resultado.total} ${resultado.total === 1 ? "ruta" : "rutas"}`;
  return (
    <section className="ts-page" aria-labelledby="historial-rutas-titulo">
      <PageHeader
        titulo="Historial de rutas"
        descripcion="Rutas planificadas, despachadas y completadas, con sus paradas y boletas."
        conteo={!cargando && !error ? conteo : null}
      />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="historial-rutas-titulo">Rutas</h2>
          {!cargando && !error && <span>{conteo}</span>}
        </div>

        <FiltrosHistorialRutas iniciales={filtros} alAplicar={aplicar} deshabilitado={cargando} />

        {error ? (
          <div style={{ padding: "0 20px 16px" }}>
            <p className="ts-modal-error" role="alert">{error}</p>
            <button type="button" className="ts-btn" onClick={() => cargar(filtros, resultado.page || 1)}>Reintentar</button>
          </div>
        ) : cargando ? (
          <p className="ts-empty">Cargando historial…</p>
        ) : resultado.items.length === 0 ? (
          <p className="ts-empty">No hay rutas que cumplan los filtros seleccionados.</p>
        ) : (
          <>
            <TablaHistorialRutas rutas={resultado.items} />
            <Paginacion
              pagina={resultado.page}
              total={resultado.totalPages}
              alCambiar={(pagina) => cargar(filtros, pagina)}
              etiqueta="Paginación del historial de rutas"
            />
          </>
        )}
      </div>
    </section>
  );
}
