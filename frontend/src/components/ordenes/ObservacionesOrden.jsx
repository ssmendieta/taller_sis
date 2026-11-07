import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_DESCRIPCION_OBSERVACION,
  TIPOS_OBSERVACION,
  listarObservacionesOrden,
  registrarObservacion,
} from "../../services/observacionesService.js";
import { mostrarFechaHora } from "../../utils/formato.js";

const etiquetaTipo = (valor) =>
  TIPOS_OBSERVACION.find((tipo) => tipo.valor === valor)?.etiqueta ?? valor;

// ABC-323: observaciones e incidencias de una orden (ABC-100).
export default function ObservacionesOrden({ ordenId, puedeRegistrar }) {
  const [observaciones, setObservaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [tipo, setTipo] = useState("OBSERVACION");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  // El estado de React tarda un render: el ref corta el doble clic de inmediato.
  const enviando = useRef(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      setObservaciones(await listarObservacionesOrden(ordenId));
    } catch (e) {
      setErrorCarga(e.message || "No se pudieron cargar las observaciones.");
    } finally {
      setCargando(false);
    }
  }, [ordenId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(evento) {
    evento.preventDefault();
    if (enviando.current) return;
    setAviso("");
    const texto = descripcion.trim();
    if (!texto) {
      setError("La descripción es obligatoria.");
      return;
    }
    enviando.current = true;
    setGuardando(true);
    setError("");
    try {
      const creada = await registrarObservacion({ ordenId, tipo, descripcion: texto });
      setObservaciones((actuales) => [creada, ...actuales]);
      setDescripcion("");
      setAviso(`${etiquetaTipo(creada.tipo)} registrada.`);
    } catch (e) {
      setError(e.message || "No se pudo registrar la observación.");
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  }

  return (
    <div className="ts-panel" id="panel-observaciones">
      <div className="ts-panel-title">
        <h2>Observaciones e incidencias</h2>
        <span>{cargando ? "Cargando…" : `${observaciones.length} registros`}</span>
      </div>

      {puedeRegistrar ? (
        <form onSubmit={guardar} noValidate style={{ padding: "12px 20px 16px" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label
              htmlFor="observacion-tipo"
              style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 160 }}
            >
              Tipo
              <select
                id="observacion-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                disabled={guardando}
                style={{ minHeight: 36, padding: "7px 10px", border: "1px solid #e0e0e2", borderRadius: 5 }}
              >
                {TIPOS_OBSERVACION.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
                ))}
              </select>
            </label>

            <label
              htmlFor="observacion-descripcion"
              style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 320px" }}
            >
              Descripción
              <textarea
                id="observacion-descripcion"
                rows={3}
                maxLength={MAX_DESCRIPCION_OBSERVACION}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                disabled={guardando}
                required
                style={{ padding: "7px 10px", border: "1px solid #e0e0e2", borderRadius: 5, resize: "vertical" }}
              />
            </label>
          </div>

          {error && <p className="ts-modal-error" role="alert">{error}</p>}
          {aviso && <p className="ts-success" role="status">{aviso}</p>}

          <div className="ts-btn-group" style={{ marginTop: 12 }}>
            <button
              type="submit"
              className="ts-btn ts-btn-primary"
              disabled={guardando || !descripcion.trim()}
            >
              {guardando ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      ) : (
        <p className="ts-empty">No tienes permiso para registrar observaciones.</p>
      )}

      {errorCarga ? (
        <div style={{ padding: "0 20px 16px" }}>
          <p className="ts-modal-error" role="alert">{errorCarga}</p>
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
        </div>
      ) : cargando ? (
        <p className="ts-empty">Cargando observaciones…</p>
      ) : observaciones.length === 0 ? (
        <p className="ts-empty">Sin observaciones ni incidencias registradas.</p>
      ) : (
        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Observaciones e incidencias de la orden, de la más reciente a la más antigua</caption>
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Descripción</th>
                <th scope="col">Autor</th>
                <th scope="col">Fecha</th>
                <th scope="col">Hora</th>
              </tr>
            </thead>
            <tbody>
              {observaciones.map((obs) => {
                const { fecha, hora } = mostrarFechaHora(obs.fechaHora);
                return (
                  <tr key={obs.id}>
                    <td>{etiquetaTipo(obs.tipo)}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{obs.descripcion}</td>
                    <td>{obs.autorNombre || `Usuario ${obs.autorUsuarioId}`}</td>
                    <td>{fecha}</td>
                    <td>{hora}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
