import { useRef, useState } from "react";
import { MAX_MOTIVO_INCIDENCIA, TIPOS_INCIDENCIA } from "../../../services/logisticaService.js";
import { formatearFecha } from "../../../utils/format.js";

const RECURSOS = { VEHICULO: "Vehículo", CHOFER: "Chofer" };
const VACIO = { tipo: "", paradaId: "", motivo: "", reprogramar: false, nuevaFecha: "" };
// CA-03: una ruta completada o cancelada no se reprograma.
const REPROGRAMABLES = ["PLANIFICADA", "DESPACHADA"];

function diaLocal(desplazamiento = 0) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + desplazamiento);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

export function validarIncidencia(datos, fechaProgramada, hoy = diaLocal()) {
  if (!datos.tipo) return "Elige el tipo de incidencia.";
  const motivo = datos.motivo.trim();
  if (!motivo) return "Escribe el motivo de la incidencia.";
  if (motivo.length > MAX_MOTIVO_INCIDENCIA) return `El motivo admite hasta ${MAX_MOTIVO_INCIDENCIA} caracteres.`;
  if (datos.reprogramar) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.nuevaFecha)) return "Elige la nueva fecha de entrega.";
    if (datos.nuevaFecha <= hoy) return "La nueva fecha de entrega debe ser posterior a hoy.";
    if (datos.nuevaFecha === fechaProgramada) return "La nueva fecha es igual a la fecha programada actual.";
  }
  return "";
}

function mensajeError(fallo) {
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  if (fallo?.status === 403) return "No tienes permiso para registrar incidencias. Permiso necesario: logistica.rutas.gestionar.";
  if (fallo?.status === 404 && /^Cannot (POST|GET)/.test(fallo.message ?? "")) {
    return "El registro de incidencias todavía no está disponible en el servidor.";
  }
  return fallo?.message || "No se pudo registrar la incidencia.";
}

// ABC-382: registra una incidencia de la ruta o de una entrega y, si se pide,
// la reprograma. Ante un error conserva todo lo escrito.
export default function FormularioIncidencia({ ruta, onRegistrar }) {
  const [datos, setDatos] = useState(VACIO);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);
  const reprogramable = REPROGRAMABLES.includes(ruta.estado);
  const reprogramar = reprogramable && datos.reprogramar;
  const paradas = [...(ruta.paradas ?? [])].sort((a, b) => a.secuencia - b.secuencia);

  function cambiar(campo, valor) {
    setDatos((actuales) => ({ ...actuales, [campo]: valor }));
    setExito("");
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enCurso.current) return;
    const invalido = validarIncidencia({ ...datos, reprogramar }, ruta.fechaProgramada);
    if (invalido) {
      setError({ mensaje: invalido, conflictos: [] });
      return;
    }
    enCurso.current = true;
    setEnviando(true);
    setError(null);
    setExito("");
    try {
      const mensaje = await onRegistrar({
        tipo: datos.tipo,
        motivo: datos.motivo,
        paradaId: datos.paradaId || null,
        nuevaFecha: reprogramar ? datos.nuevaFecha : null,
      });
      setDatos(VACIO);
      setExito(mensaje);
    } catch (fallo) {
      setError({ mensaje: mensajeError(fallo), conflictos: fallo?.conflictos ?? [] });
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  return (
    <form className="incidencias-formulario" onSubmit={enviar} aria-label="Registrar incidencia" noValidate>
      {exito && <p className="ts-success" role="status">{exito}</p>}
      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error.mensaje}</p>
          {error.conflictos.length > 0 && (
            <ul className="incidencias-conflictos">
              {error.conflictos.map((conflicto, indice) => (
                <li key={indice}>
                  {RECURSOS[conflicto.recurso] ?? conflicto.recurso} {conflicto.idExterno}: {conflicto.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="incidencias-campos">
        <div className="ts-field">
          <label htmlFor="incidencia-tipo">Tipo de incidencia</label>
          <select id="incidencia-tipo" value={datos.tipo} disabled={enviando} onChange={(evento) => cambiar("tipo", evento.target.value)}>
            <option value="">Elige un tipo</option>
            {Object.entries(TIPOS_INCIDENCIA).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </div>
        <div className="ts-field">
          <label htmlFor="incidencia-parada">Entrega afectada</label>
          <select id="incidencia-parada" value={datos.paradaId} disabled={enviando} onChange={(evento) => cambiar("paradaId", evento.target.value)}>
            <option value="">Toda la ruta</option>
            {paradas.map((parada) => (
              <option key={parada.id} value={parada.id}>Parada {parada.secuencia} · {parada.destino}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="ts-field">
        <label htmlFor="incidencia-motivo">Motivo</label>
        <textarea id="incidencia-motivo" rows={3} maxLength={MAX_MOTIVO_INCIDENCIA} value={datos.motivo} disabled={enviando}
          onChange={(evento) => cambiar("motivo", evento.target.value)} />
        <p className="ts-field-help">{datos.motivo.length}/{MAX_MOTIVO_INCIDENCIA} caracteres.</p>
      </div>

      {reprogramable ? (
        <div className="incidencias-reprogramar">
          <label className="incidencias-check" htmlFor="incidencia-reprogramar">
            <input id="incidencia-reprogramar" type="checkbox" checked={datos.reprogramar} disabled={enviando}
              onChange={(evento) => cambiar("reprogramar", evento.target.checked)} />
            Reprogramar la entrega a otra fecha
          </label>
          {datos.reprogramar && (
            <div className="ts-field">
              <label htmlFor="incidencia-fecha">Nueva fecha de entrega</label>
              <input id="incidencia-fecha" type="date" min={diaLocal(1)} value={datos.nuevaFecha} disabled={enviando}
                onChange={(evento) => cambiar("nuevaFecha", evento.target.value)} />
              <p className="ts-field-help">
                Fecha programada actual: {formatearFecha(ruta.fechaProgramada)}. Al reprogramar se vuelven a validar el
                vehículo y el chofer para la nueva fecha.
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="ts-field-help">Una ruta {ruta.estado === "COMPLETADA" ? "completada" : "cancelada"} no se puede reprogramar.</p>
      )}

      <div className="ts-btn-group">
        <button type="submit" className="ts-btn ts-btn-primary" disabled={enviando}>
          {enviando ? "Registrando…" : reprogramar ? "Registrar y reprogramar" : "Registrar incidencia"}
        </button>
      </div>
    </form>
  );
}
