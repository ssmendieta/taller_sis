import { useCallback, useEffect, useRef, useState } from "react";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import {
  listarDemandas,
  listarDemandasPlanificables,
  PERMISO_CONSULTAR_DEMANDAS,
} from "../services/demandasService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import Paginacion from "../components/ui/Paginacion.jsx";
import FiltrosDemandas, {
  FILTROS_DEMANDAS_INICIALES,
} from "../components/produccion/demandas/FiltrosDemandas.jsx";
import TablaDemandas from "../components/produccion/demandas/TablaDemandas.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

const RESULTADO_VACIO = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar demandas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudieron cargar las demandas.";
}

// ABC-358: consulta de demandas recibidas; no genera órdenes automáticamente.
export default function DemandasPage() {
  const { usuario } = useSesion();
  const puedeConsultar = tienePermiso(usuario, PERMISO_CONSULTAR_DEMANDAS);
  const [resultado, setResultado] = useState(RESULTADO_VACIO);
  const [vista, setVista] = useState("recibidas");
  const [filtros, setFiltros] = useState(FILTROS_DEMANDAS_INICIALES);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const ultimaCarga = useRef(0);

  const cargar = useCallback(
    async (aplicados, pagina) => {
      if (!puedeConsultar) return;
      const carga = ++ultimaCarga.current;
      setCargando(true);
      setError("");
      try {
        const consultar = vista === "planificables"
          ? listarDemandasPlanificables
          : listarDemandas;
        const respuesta = await consultar({ ...aplicados, page: pagina });
        if (!Array.isArray(respuesta?.items)) {
          throw new Error("El servidor devolvió un listado de demandas inválido.");
        }
        if (carga === ultimaCarga.current) setResultado(respuesta);
      } catch (fallo) {
        if (carga !== ultimaCarga.current) return;
        setResultado(RESULTADO_VACIO);
        setError(mensajeError(fallo));
      } finally {
        if (carga === ultimaCarga.current) setCargando(false);
      }
    },
    [puedeConsultar, vista],
  );

  useEffect(() => {
    document.title = FORMATO_TITULO(
      vista === "planificables" ? "Demandas planificables" : "Demandas recibidas",
    );
    cargar(FILTROS_DEMANDAS_INICIALES, 1);
    return () => {
      ultimaCarga.current += 1;
    };
  }, [cargar, vista]);

  function cambiarVista(nuevaVista) {
    if (nuevaVista === vista) return;
    setResultado(RESULTADO_VACIO);
    setFiltros(FILTROS_DEMANDAS_INICIALES);
    setVista(nuevaVista);
  }

  function aplicarFiltros(nuevos) {
    setFiltros(nuevos);
    cargar(nuevos, 1);
  }

  if (!puedeConsultar) {
    return (
      <div className="ts-panel" style={{ padding: 24 }}>
        <p className="ts-feedback ts-error" role="alert">
          No tienes permiso para consultar demandas.
        </p>
      </div>
    );
  }

  return (
    <div className="demandas-page">
      <PageHeader
        titulo="Demandas de producción"
        descripcion="Consulta separada de demandas recibidas y demandas confirmadas disponibles para planificación."
      />

      <div className="ts-btn-group" role="tablist" aria-label="Tipo de demandas" style={{ marginBottom: 16 }}>
        <button
          type="button"
          role="tab"
          aria-selected={vista === "recibidas"}
          className={`ts-btn ${vista === "recibidas" ? "ts-btn-primary" : ""}`}
          onClick={() => cambiarVista("recibidas")}
        >
          Recibidas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === "planificables"}
          className={`ts-btn ${vista === "planificables" ? "ts-btn-primary" : ""}`}
          onClick={() => cambiarVista("planificables")}
        >
          Planificables
        </button>
      </div>

      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <FiltrosDemandas
          key={vista}
          iniciales={filtros}
          alAplicar={aplicarFiltros}
          deshabilitado={cargando}
          mostrarEstado={vista === "recibidas"}
        />
      </div>

      <div className="ts-panel">
        <div className="ts-panel-header" style={{ padding: "16px 20px 8px" }}>
          <h2>{`${vista === "planificables" ? "Demandas planificables" : "Listado de demandas"} (${resultado.total})`}</h2>
          <span style={{ fontSize: "0.85rem", color: "#666" }}>
            {vista === "planificables"
              ? "Solo se muestran demandas confirmadas; consultarlas no crea órdenes automáticamente."
              : "Las demandas son informativas; no se crean órdenes automáticamente sin intervención."}
          </span>
        </div>

        {cargando && (
          <div style={{ padding: 24, textAlign: "center" }} role="status">
            <p>Cargando demandas...</p>
          </div>
        )}

        {!cargando && error && (
          <div style={{ padding: 20 }}>
            <p className="ts-feedback ts-error" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="ts-btn ts-btn--sm"
              onClick={() => cargar(filtros, resultado.page)}
            >
              Reintentar
            </button>
          </div>
        )}

        {!cargando && !error && resultado.items.length === 0 && (
          <div style={{ padding: 32, textAlign: "center" }} role="status">
            <p style={{ color: "#666" }}>
              {vista === "planificables"
                ? "No se encontraron demandas confirmadas disponibles para planificar."
                : "No se encontraron demandas con los filtros seleccionados."}
            </p>
          </div>
        )}

        {!cargando && !error && resultado.items.length > 0 && (
          <>
            <TablaDemandas demandas={resultado.items} />
            <div style={{ padding: "12px 20px" }}>
              <Paginacion
                pagina={resultado.page}
                total={resultado.totalPages}
                alCambiar={(pag) => cargar(filtros, pag)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
