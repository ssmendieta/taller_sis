import { useEffect, useRef, useState } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";
import SelectorRecursosLogisticos from "../components/logistica/SelectorRecursosLogisticos.jsx";
import { consultarRecursosLogisticos, PERMISO_CONSULTAR_RECURSOS, UNIDADES_CAPACIDAD } from "../services/logisticaService.js";
import { formatearCantidad, formatearFecha, formatearFechaHora } from "../utils/format.js";
import { FORMATO_TITULO } from "../constants/marca.js";
import "../styles/recursos-logisticos.css";

const CAPACIDAD = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;
const SIN_SELECCION = { vehiculo: null, chofer: null };

function hoy() {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function filtrosIniciales() {
  return { fecha: hoy(), disponible: "", capacidadMinima: "", unidad: "kg" };
}

function fechaHora(valor) {
  const { fecha, hora } = formatearFechaHora(valor);
  return `${fecha} ${hora}`;
}

function mensajeError(fallo) {
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  if (fallo?.status === 403) return `No tienes permiso para consultar recursos logísticos. Permiso necesario: ${PERMISO_CONSULTAR_RECURSOS}.`;
  return fallo?.message || "No se pudieron consultar los recursos logísticos.";
}

function validar({ fecha, capacidadMinima }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Elige la fecha de planificación.";
  const capacidad = capacidadMinima.trim();
  if (capacidad && (!CAPACIDAD.test(capacidad) || Number(capacidad) <= 0)) {
    return "La capacidad mínima debe ser mayor que 0, con hasta 4 decimales.";
  }
  return "";
}

function Vigencia({ resultado }) {
  const generado = fechaHora(resultado.generadoEn);
  if (resultado.origen === "RESPALDO") {
    return (
      <div className="recursos-vigencia recursos-vigencia--respaldo" role="alert">
        <span className="ts-badge ts-badge--INSUFICIENTE">Copia de respaldo</span>
        <p>
          {resultado.aviso.mensaje} Copia sincronizada el {fechaHora(resultado.sincronizadoEn)} (datos generados por el
          ERP el {generado}). Verifica la disponibilidad antes de confirmar la ruta.
        </p>
      </div>
    );
  }
  return (
    <div className="recursos-vigencia recursos-vigencia--erp" role="status">
      <span className="ts-badge ts-badge--DISPONIBLE">Datos del ERP</span>
      <p>
        Recursos del {formatearFecha(resultado.fecha)} generados por el ERP el {generado} y consultados el{" "}
        {fechaHora(resultado.sincronizadoEn)}.
      </p>
    </div>
  );
}

// ABC-353: revisar vehículos y choferes del ERP, con su origen y vigencia,
// antes de planificar una ruta. Consultar o elegir no reserva recursos.
export default function RecursosLogisticosPage() {
  const [filtros, setFiltros] = useState(filtrosIniciales);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState(SIN_SELECCION);
  const consulta = useRef(null);

  async function cargar(aplicados) {
    consulta.current?.abort();
    const controller = new AbortController();
    consulta.current = controller;
    setCargando(true);
    setError(null);
    setResultado(null);
    setSeleccion(SIN_SELECCION);
    try {
      const datos = await consultarRecursosLogisticos(aplicados, { signal: controller.signal });
      if (consulta.current === controller) setResultado(datos);
    } catch (fallo) {
      if (consulta.current !== controller || fallo?.name === "AbortError") return;
      setError({ mensaje: mensajeError(fallo), sinCopia: fallo?.codigo === "RECURSOS_NO_DISPONIBLES" });
    } finally {
      if (consulta.current === controller) setCargando(false);
    }
  }

  useEffect(() => {
    document.title = FORMATO_TITULO("Recursos logísticos");
    cargar(filtros);
    return () => {
      consulta.current?.abort();
      consulta.current = null;
    };
  }, []);

  function cambiar(campo, valor) {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }));
  }

  function aplicar(evento) {
    evento.preventDefault();
    const invalido = validar(filtros);
    if (invalido) {
      setError({ mensaje: invalido, sinCopia: false });
      return;
    }
    cargar(filtros);
  }

  function limpiar() {
    const iniciales = filtrosIniciales();
    setFiltros(iniciales);
    cargar(iniciales);
  }

  function seleccionar(tipo, idExterno) {
    setSeleccion((actual) => ({ ...actual, [tipo]: idExterno }));
  }

  const vehiculo = resultado?.vehiculos.find((fila) => fila.idExterno === seleccion.vehiculo);
  const chofer = resultado?.choferes.find((fila) => fila.idExterno === seleccion.chofer);

  return (
    <section className="ts-page recursos-logisticos" aria-labelledby="recursos-titulo">
      <PageHeader
        titulo="Recursos logísticos"
        descripcion="Vehículos y choferes del ERP para revisar su disponibilidad y vigencia antes de planificar una ruta."
      />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="recursos-titulo">Consulta por fecha</h2>
        </div>
        <form className="ts-filters" onSubmit={aplicar} aria-label="Filtros de recursos" noValidate>
          <label htmlFor="recursos-fecha">Fecha de planificación
            <input id="recursos-fecha" type="date" required value={filtros.fecha}
              onChange={(evento) => cambiar("fecha", evento.target.value)} />
          </label>
          <label htmlFor="recursos-disponible">Disponibilidad
            <select id="recursos-disponible" value={filtros.disponible}
              onChange={(evento) => cambiar("disponible", evento.target.value)}>
              <option value="">Todos</option>
              <option value="true">Solo disponibles</option>
              <option value="false">Solo no disponibles</option>
            </select>
          </label>
          <label htmlFor="recursos-capacidad">Capacidad mínima del vehículo
            <input id="recursos-capacidad" type="text" inputMode="decimal" placeholder="Ej. 1500" maxLength={15}
              value={filtros.capacidadMinima} onChange={(evento) => cambiar("capacidadMinima", evento.target.value)} />
          </label>
          <label htmlFor="recursos-unidad">Unidad
            <select id="recursos-unidad" value={filtros.unidad} onChange={(evento) => cambiar("unidad", evento.target.value)}>
              {UNIDADES_CAPACIDAD.map((unidad) => <option key={unidad} value={unidad}>{unidad}</option>)}
            </select>
          </label>
          <div className="ts-btn-group">
            <button type="submit" className="ts-btn ts-btn-primary" disabled={cargando}>
              {cargando ? "Consultando…" : "Consultar"}
            </button>
            <button type="button" className="ts-btn" onClick={limpiar} disabled={cargando}>Limpiar</button>
          </div>
        </form>
        <p className="ts-field-help recursos-nota">
          La capacidad se compara en la misma unidad, sin conversiones. Consultar o elegir recursos no los reserva en
          el ERP: la asignación se confirma al planificar la ruta.
        </p>
      </div>

      {cargando && (
        <p className="ts-notice" role="status">
          Consultando el ERP… Si no responde, se usará la última copia de respaldo de la fecha.
        </p>
      )}

      {error && (
        <div className="ts-feedback ts-error" role="alert">
          {error.sinCopia ? (
            <>
              <strong>Recursos no disponibles.</strong> {error.mensaje} No se muestra disponibilidad hasta que el ERP
              responda.
            </>
          ) : error.mensaje}
        </div>
      )}

      {resultado && (
        <>
          <Vigencia resultado={resultado} />
          <SelectorRecursosLogisticos
            vehiculos={resultado.vehiculos}
            choferes={resultado.choferes}
            totales={resultado.totales}
            seleccion={seleccion}
            onSeleccionar={seleccionar}
          />
          <div className="ts-panel recursos-seleccion" aria-live="polite">
            <div className="ts-panel-title">
              <h2>Selección para planificar</h2>
            </div>
            {vehiculo || chofer ? (
              <dl>
                <dt>Vehículo</dt>
                <dd>{vehiculo
                  ? `${vehiculo.idExterno} · ${vehiculo.placa} · ${formatearCantidad(vehiculo.capacidad.valor, vehiculo.capacidad.unidad)}`
                  : "Sin elegir"}</dd>
                <dt>Chofer</dt>
                <dd>{chofer ? `${chofer.idExterno} · ${chofer.nombre}` : "Sin elegir"}</dd>
              </dl>
            ) : (
              <p className="ts-empty">Elige un vehículo y un chofer disponibles.</p>
            )}
            <p className="ts-field-help">
              La selección no reserva los recursos
              {resultado.origen === "RESPALDO" ? " y proviene de una copia de respaldo" : ""}.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
