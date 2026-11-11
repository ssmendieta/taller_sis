import { useCallback, useEffect, useRef, useState } from "react";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import {
  consultarHistorialOrdenes,
  FILTROS_HISTORIAL_INICIALES,
  PERMISO_HISTORIAL_PRODUCCION,
  validarFiltrosHistorial,
} from "../services/historialProduccionService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import FiltrosHistorialProduccion from "../components/produccion/historial/FiltrosHistorialProduccion.jsx";
import TablaHistorialProduccion from "../components/produccion/historial/TablaHistorialProduccion.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

const RESULTADO_VACIO = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };

function formatearMensajeError(fallo) {
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar para consultar el historial.";
  if (fallo?.status === 403) return "No tienes permiso para consultar el historial de producción.";
  return fallo?.message || "No se pudo cargar el historial de órdenes de producción. Intenta de nuevo.";
}

export default function HistorialProduccionPage() {
  const { usuario } = useSesion();
  const puedeConsultar = tienePermiso(usuario, PERMISO_HISTORIAL_PRODUCCION);

  const [resultado, setResultado] = useState(RESULTADO_VACIO);
  const [filtros, setFiltros] = useState(FILTROS_HISTORIAL_INICIALES);
  const [aplicados, setAplicados] = useState(FILTROS_HISTORIAL_INICIALES);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorFiltros, setErrorFiltros] = useState("");

  const ultimaCarga = useRef(0);
  const controlador = useRef(null);

  const cargar = useCallback(
    async (filtrosAConsultar, pagina = 1) => {
      if (!puedeConsultar) return;

      let consultaValidada;
      try {
        consultaValidada = validarFiltrosHistorial({ ...filtrosAConsultar, page: pagina });
        setErrorFiltros("");
      } catch (valError) {
        setErrorFiltros(valError.message);
        return;
      }

      const cargaId = ++ultimaCarga.current;
      controlador.current?.abort();
      controlador.current = new AbortController();

      setCargando(true);
      setError("");

      try {
        const respuesta = await consultarHistorialOrdenes(consultaValidada, {
          signal: controlador.current.signal,
        });

        if (cargaId === ultimaCarga.current) {
          setResultado(respuesta);
          setAplicados(filtrosAConsultar);
        }
      } catch (fallo) {
        if (fallo?.name === "AbortError" || cargaId !== ultimaCarga.current) return;
        setResultado(RESULTADO_VACIO);
        setError(formatearMensajeError(fallo));
      } finally {
        if (cargaId === ultimaCarga.current) {
          setCargando(false);
        }
      }
    },
    [puedeConsultar]
  );

  useEffect(() => {
    document.title = FORMATO_TITULO("Historial de producción");
    cargar(FILTROS_HISTORIAL_INICIALES, 1);
    return () => {
      controlador.current?.abort();
    };
  }, [cargar]);

  const alAplicar = () => {
    cargar(filtros, 1);
  };

  const alLimpiar = () => {
    setFiltros(FILTROS_HISTORIAL_INICIALES);
    cargar(FILTROS_HISTORIAL_INICIALES, 1);
  };

  const alCambiarPagina = (nuevaPagina) => {
    cargar(aplicados, nuevaPagina);
  };

  if (!puedeConsultar) {
    return (
      <div className="ts-page">
        <PageHeader
          titulo="Historial de producción"
          descripcion="Consulta cronológica de órdenes de producción y eventos pasados."
        />
        <div className="ts-empty" role="alert">
          <p>No tienes permiso para consultar el historial de órdenes de producción.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-page" aria-busy={cargando}>
      <PageHeader
        titulo="Historial de producción"
        descripcion="Consulta cronológica de órdenes de producción y su estado."
      />

      <FiltrosHistorialProduccion
        filtros={filtros}
        alCambiar={setFiltros}
        alAplicar={alAplicar}
        alLimpiar={alLimpiar}
        error={errorFiltros}
        deshabilitado={cargando}
      />

      {cargando && (
        <div className="ts-loading" role="status" style={{ padding: "16px 0" }}>
          <p>Cargando órdenes de producción...</p>
        </div>
      )}

      {error && (
        <div
          className="ts-modal-error"
          role="alert"
          style={{ margin: "16px 0", padding: "12px 16px" }}
        >
          <p>{error}</p>
          <button
            type="button"
            className="ts-btn ts-btn--sm"
            style={{ marginTop: "8px" }}
            onClick={() => cargar(aplicados, resultado.page || 1)}
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !error && (
        <TablaHistorialProduccion
          items={resultado.items}
          total={resultado.total}
          page={resultado.page}
          totalPages={resultado.totalPages}
          alCambiarPagina={alCambiarPagina}
        />
      )}
    </div>
  );
}
