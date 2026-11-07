import { useCallback, useEffect, useRef, useState } from "react";
import {
  obtenerResumenAvanceOrden,
  registrarAvance,
} from "../../services/ordenesService.js";
import { formatearCantidad, formatearNumero } from "../../utils/format.js";
import { mostrarEstadoOrden, mostrarFechaHora } from "../../utils/formato.js";

// ABC-319 y ABC-320: Indicador de avance y detalle de registros por orden (ABC-105).
// Componente de detalle de una orden puntual; no es dashboard global.
export default function AvanceOrden({
  ordenId,
  unidad = "",
  enProduccion = false,
  permiteRegistrar = false,
  estadoOrden = "",
  onAvanceRegistrado,
}) {
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [cantidadAvance, setCantidadAvance] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorRegistro, setErrorRegistro] = useState("");
  const [avisoRegistro, setAvisoRegistro] = useState("");
  const envioEnCurso = useRef(false);

  const cargar = useCallback(async () => {
    if (!ordenId) return;
    setCargando(true);
    setErrorCarga("");
    try {
      const datos = await obtenerResumenAvanceOrden(ordenId);
      setResumen(datos);
    } catch (e) {
      setResumen(null);
      setErrorCarga(e.message || "No se pudo cargar el avance de la orden.");
    } finally {
      setCargando(false);
    }
  }, [ordenId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Denominador seguro y cálculos garantizados sin NaN (CA-01 y CA-02)
  const solicitada = Number(resumen?.cantidad_solicitada ?? 0);
  const producida = Number(resumen?.cantidad_producida ?? 0);
  const pendiente = Number(resumen?.cantidad_pendiente ?? Math.max(solicitada - producida, 0));
  const porcentaje = Number.isFinite(resumen?.porcentaje_avance)
    ? Number(resumen.porcentaje_avance)
    : (solicitada > 0 ? Number(((producida * 100) / solicitada).toFixed(2)) : 0);
  const porcentajeSeguro = Math.min(100, Math.max(0, porcentaje));
  const registros = Array.isArray(resumen?.registros) ? resumen.registros : [];

  async function guardar(evento) {
    evento.preventDefault();
    if (envioEnCurso.current) return;
    setAvisoRegistro("");

    const valor = Number(cantidadAvance);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErrorRegistro("Ingresa una cantidad mayor que cero.");
      return;
    }

    if (valor > pendiente) {
      setErrorRegistro(
        `La cantidad ingresada (${formatearCantidad(valor, unidad)}) supera la cantidad pendiente (${formatearCantidad(pendiente, unidad)}).`
      );
      return;
    }

    envioEnCurso.current = true;
    setGuardando(true);
    setErrorRegistro("");

    try {
      await registrarAvance(ordenId, valor);
      setCantidadAvance("");
      setAvisoRegistro("Avance registrado exitosamente.");
      await cargar();
      if (typeof onAvanceRegistrado === "function") {
        onAvanceRegistrado();
      }
    } catch (e) {
      setErrorRegistro(e.message || "No se pudo registrar el avance.");
    } finally {
      envioEnCurso.current = false;
      setGuardando(false);
    }
  }

  return (
    <div className="ts-panel" style={{ marginBottom: 16 }}>
      <div className="ts-panel-title">
        <h2>Avance de producción</h2>
        <span>
          {cargando ? (
            "Cargando…"
          ) : (
            `${formatearCantidad(producida, unidad)} de ${formatearCantidad(solicitada, unidad)}`
          )}
        </span>
      </div>

      <div style={{ padding: "12px 20px 18px" }}>
        {errorCarga ? (
          <div className="ts-modal-error" role="alert" style={{ marginBottom: 12 }}>
            <p style={{ margin: 0 }}>{errorCarga}</p>
            <button
              type="button"
              className="ts-btn ts-btn-sm"
              style={{ marginTop: 8 }}
              onClick={cargar}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {/* Indicador visual y métricas de avance (ABC-319 / CA-01, CA-02) */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                className={`ts-badge ${porcentajeSeguro >= 100 ? "ts-badge--FINALIZADA" : "ts-badge--EN_PRODUCCION"}`}
                style={{ fontSize: ".85rem", fontWeight: 600 }}
              >
                {porcentajeSeguro}%
              </span>
              <span style={{ fontSize: ".85rem", color: "#535860" }}>
                <strong>{formatearNumero(producida)}</strong> de{" "}
                <strong>{formatearNumero(solicitada)}</strong>
                {unidad ? ` ${unidad}` : ""}
              </span>
            </div>

            <div style={{ fontSize: ".8rem", color: "#717680" }}>
              Pendiente: <strong>{formatearCantidad(pendiente, unidad)}</strong>
            </div>
          </div>

          {/* Barra de progreso accesible con role progressbar */}
          <div
            className="ts-progress"
            role="progressbar"
            aria-valuenow={porcentajeSeguro}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label={`Avance de la orden: ${porcentajeSeguro}% (${formatearNumero(producida)} de ${formatearNumero(solicitada)}${unidad ? " " + unidad : ""})`}
            style={{ width: "100%", height: 10 }}
          >
            <div className="ts-progress-track" style={{ height: 10, width: "100%" }} aria-hidden="true">
              <div
                className={`ts-progress-fill${porcentajeSeguro >= 100 ? " ts-progress-fill--lleno" : ""}`}
                style={{ width: `${porcentajeSeguro}%` }}
              />
            </div>
          </div>
        </div>

        {/* Formulario de registro de avance (solo en producción con permisos) */}
        {enProduccion && permiteRegistrar ? (
          <form onSubmit={guardar} style={{ marginTop: 14, marginBottom: 16 }}>
            <label
              htmlFor="avance-cantidad"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: 320,
                color: "#535860",
                fontSize: ".76rem",
              }}
            >
              Cantidad producida{unidad ? ` (en ${unidad})` : ""}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  id="avance-cantidad"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  max={pendiente > 0 ? pendiente : undefined}
                  value={cantidadAvance}
                  onChange={(e) => setCantidadAvance(e.target.value)}
                  disabled={guardando || pendiente <= 0}
                  placeholder="0.0000"
                  style={{
                    minHeight: 36,
                    padding: "7px 10px",
                    border: "1px solid #e0e0e2",
                    borderRadius: 5,
                    background: "#f4f4f5",
                    flex: 1,
                  }}
                />
                {unidad && <span aria-hidden="true">{unidad}</span>}
              </div>
            </label>

            {errorRegistro && (
              <p className="ts-modal-error" role="alert" style={{ marginTop: 8 }}>
                {errorRegistro}
              </p>
            )}

            {avisoRegistro && (
              <p className="ts-success-msg" role="status" style={{ marginTop: 8, color: "#198754", fontSize: ".8rem" }}>
                {avisoRegistro}
              </p>
            )}

            <div className="ts-btn-group" style={{ marginTop: 10 }}>
              <button
                type="submit"
                className="ts-btn ts-btn-primary"
                disabled={guardando || pendiente <= 0}
              >
                {guardando ? "Registrando…" : "Registrar avance"}
              </button>

              <button
                type="button"
                className="ts-btn"
                disabled={guardando || pendiente <= 0}
                onClick={() => setCantidadAvance(String(pendiente))}
              >
                Completar restante
              </button>
            </div>
          </form>
        ) : (
          <p className="ts-empty" style={{ margin: "10px 0" }}>
            {enProduccion
              ? "Sin permiso para registrar avances."
              : `Solo se registra avance en estado En producción (actual: ${mostrarEstadoOrden(estadoOrden)}).`}
          </p>
        )}

        {/* Detalle cronológico de registros de avance (ABC-320 / CA-03, CA-05) */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <h3 style={{ fontSize: ".88rem", margin: 0, color: "#323539" }}>
              Historial de avances registrados
            </h3>
            <a
              href="#panel-observaciones"
              style={{ fontSize: ".76rem", color: "#0d6efd", textDecoration: "none" }}
            >
              Ver observaciones de la orden &darr;
            </a>
          </div>

          {registros.length > 0 ? (
            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Avances registrados de la orden</caption>
                <thead>
                  <tr>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Hora</th>
                    <th scope="col">Responsable</th>
                    <th scope="col">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((registro, idx) => {
                    const { fecha, hora } = mostrarFechaHora(registro.fecha_hora);
                    return (
                      <tr key={registro.id ?? idx}>
                        <td>
                          <strong>{formatearCantidad(registro.cantidad_producida, unidad)}</strong>
                        </td>
                        <td>{fecha}</td>
                        <td>{hora}</td>
                        <td>{registro.usuario_responsable_nombre ?? "—"}</td>
                        <td>{registro.observaciones ?? registro.nota ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ts-empty">Sin avances registrados (0 %).</p>
          )}
        </div>
      </div>
    </div>
  );
}
