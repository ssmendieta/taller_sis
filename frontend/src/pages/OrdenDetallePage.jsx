import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import {
  cambiarEstadoOrden,
  obtenerAvancesOrden,
  obtenerDisponibilidadOrden,
  obtenerHistorialOrden,
  obtenerMaterialesOrden,
  obtenerOrden,
  obtenerTotalProducido,
  registrarAvance,
} from "../services/ordenesService.js";
import { obtenerRecetas } from "../services/recetasService.js";
import { tienePermiso } from "../services/permisos.js";
import { accionesPara, puedeRegistrarAvance, puedeVerAcciones } from "../utils/ordenes.js";
import {
  cantidadSolicitadaOrden,
  fechaProgramadaOrden,
  historialNormalizado,
  materialesNormalizados,
  mostrarCantidad,
  mostrarEstadoOrden,
  mostrarFecha,
  mostrarFechaHora,
  nombreProductoOrden,
  responsableOrden,
  totalProducidoDe,
} from "../utils/formato.js";
import { BadgeDisponibilidad, BadgeEstadoOrden, BarraAvance } from "../components/ui/Badges.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";

const ETIQUETAS = {
  PLANIFICADA: { titulo: "planificación", verbo: "Planificar" },
  EN_PRODUCCION: { titulo: "inicio de producción", verbo: "Iniciar producción" },
  FINALIZADA: { titulo: "finalización", verbo: "Finalizar" },
  CANCELADA: { titulo: "cancelación", verbo: "Cancelar" },
};

// Detalle de orden (ABC-187 historial + ABC-142 materiales requeridos).
// Acciones contextuales por estado y permiso; el backend valida todo.
export default function OrdenDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useSesion();
  const [orden, setOrden] = useState(null);
  const [materiales, setMateriales] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [avances, setAvances] = useState([]);
  const [total, setTotal] = useState(0);
  const [recetaActiva, setRecetaActiva] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [accion, setAccion] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");
  const [cantidadAvance, setCantidadAvance] = useState("");
  const [errorAvance, setErrorAvance] = useState("");
  const [guardandoAvance, setGuardandoAvance] = useState(false);

  const muestraAcciones = puedeVerAcciones(usuario);
  const permiteAvance = puedeRegistrarAvance(usuario);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const [detalle, mats, historialDatos] = await Promise.all([
        obtenerOrden(id),
        obtenerMaterialesOrden(id).catch(() => ({ materiales: [] })),
        obtenerHistorialOrden(id).catch(() => []),
      ]);
      setOrden(detalle);
      setMateriales(materialesNormalizados(mats));
      setHistorial(historialNormalizado(historialDatos));
      // Disponibilidad (semáforo) y avance: no bloquean el detalle si fallan.
      try {
        const disp = await obtenerDisponibilidadOrden(id);
        setDisponibilidad(materialesNormalizados(disp));
      } catch { setDisponibilidad([]); }
      try {
        setTotal(totalProducidoDe(await obtenerTotalProducido(id)));
      } catch {
        setTotal(Number(detalle?.avance?.acumulado ?? 0));
      }
      try {
        setAvances(await obtenerAvancesOrden(id).catch(() => []));
      } catch { setAvances([]); }
      // Estado de la receta (para explicar el bloqueo de Iniciar).
      const recetaId = detalle?.producto_id ?? detalle?.receta_id ?? detalle?.productoId;
      if (recetaId != null && tienePermiso(usuario, "recetas.gestionar")) {
        try {
          const recetas = await obtenerRecetas();
          const receta = (Array.isArray(recetas) ? recetas : []).find((r) => Number(r.id) === Number(recetaId));
          setRecetaActiva(receta ? Boolean(receta.activa) : null);
        } catch { setRecetaActiva(null); }
      }
    } catch (fallo) {
      setError(fallo.message || "No se pudo cargar el detalle de la orden.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const solicitada = cantidadSolicitadaOrden(orden);
  const faltantes = useMemo(
    () => disponibilidad.filter((m) => m.estado === "INSUFICIENTE" || m.estado === "FALTANTE"),
    [disponibilidad],
  );
  const motivoBloqueoInicio = useMemo(() => {
    if (orden?.estado !== "PLANIFICADA") return "";
    if (recetaActiva === false) return "La receta de esta orden está inactiva.";
    if (faltantes.length > 0) {
      const nombres = faltantes.map((m) => `${m.codigo} (${mostrarCantidad(m.requerida)} ${m.unidad}, disponible ${mostrarCantidad(m.disponible)})`.trim()).join(", ");
      return `Faltan materiales: ${nombres}.`;
    }
    return "";
  }, [orden, recetaActiva, faltantes]);

  const acciones = useMemo(
    () => (orden ? accionesPara(usuario, orden.estado) : []),
    [orden, usuario],
  );

  async function confirmarAccion(evento) {
    evento.preventDefault();
    if (!accion || guardando) return;
    if (accion.destino === "CANCELADA" && !motivo.trim()) {
      setErrorAccion("Indica el motivo de cancelación.");
      return;
    }
    setGuardando(true);
    setErrorAccion("");
    try {
      await cambiarEstadoOrden(id, accion.destino, accion.destino === "CANCELADA" ? motivo.trim() : undefined);
      const etiqueta = ETIQUETAS[accion.destino] ?? { titulo: accion.destino };
      setAviso(`La orden ahora está ${mostrarEstadoOrden(accion.destino).toLowerCase()} (${etiqueta.titulo}).`);
      setAccion(null);
      setMotivo("");
      await cargar();
    } catch (fallo) {
      setErrorAccion(fallo.message || "No se pudo cambiar el estado de la orden.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarAvance(evento) {
    evento.preventDefault();
    if (guardandoAvance) return;
    setErrorAvance("");
    const cantidad = Number(cantidadAvance);
    if (!cantidadAvance || !Number.isFinite(cantidad) || cantidad <= 0) {
      setErrorAvance("Ingresa una cantidad mayor a cero.");
      return;
    }
    const restante = Number(solicitada) - Number(total);
    if (Number.isFinite(restante) && cantidad > restante) {
      setErrorAvance(`La cantidad supera lo solicitado. Restan ${mostrarCantidad(restante)}.`);
      return;
    }
    setGuardandoAvance(true);
    try {
      await registrarAvance(id, cantidad);
      setCantidadAvance("");
      setAviso("Avance registrado correctamente.");
      await cargar();
    } catch (fallo) {
      setErrorAvance(fallo.message || "No se pudo registrar el avance.");
    } finally {
      setGuardandoAvance(false);
    }
  }

  if (cargando) return <p className="ts-feedback" role="status">Cargando detalle de la orden…</p>;
  if (error) {
    return (
      <div className="ts-feedback ts-error" role="alert">
        <p>{error}</p>
        <div className="ts-btn-group">
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
          <Link className="ts-btn" to="/ordenes">Volver al listado</Link>
        </div>
      </div>
    );
  }
  if (!orden) return null;

  const enProduccion = orden.estado === "EN_PRODUCCION";

  return (
    <section className="ts-page" aria-labelledby="detalle-orden-titulo">
      <PageHeader
        titulo={`Orden ${orden.codigo ?? ""}`}
        descripcion={`${nombreProductoOrden(orden)} · ${mostrarEstadoOrden(orden.estado)}`}
        accion={<Link className="ts-btn" to="/ordenes">← Volver</Link>}
      />
      {aviso && <p className="ts-success" role="status">{aviso}</p>}

      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title"><h2 id="detalle-orden-titulo">Datos generales</h2><BadgeEstadoOrden estado={orden.estado} /></div>
        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Datos generales de la orden</caption>
            <tbody>
              <tr><th scope="row">Código</th><td className="ts-code">{orden.codigo ?? "—"}</td></tr>
              <tr><th scope="row">Producto</th><td>{nombreProductoOrden(orden)}</td></tr>
              <tr><th scope="row">Cantidad solicitada</th><td>{mostrarCantidad(solicitada)}</td></tr>
              <tr><th scope="row">Fecha programada</th><td>{mostrarFecha(fechaProgramadaOrden(orden))}</td></tr>
              <tr><th scope="row">Responsable</th><td>{responsableOrden(orden)}</td></tr>
              <tr><th scope="row">Avance</th><td><BarraAvance acumulado={total} solicitada={Number(solicitada) || 0} /></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {muestraAcciones && acciones.length > 0 && (
        <div className="ts-panel" style={{ marginBottom: 16 }}>
          <div className="ts-panel-title"><h2>Acciones</h2><span>Según estado y tus permisos</span></div>
          <div className="ts-filters">
            <div className="ts-btn-group">
              {acciones.map((a) => {
                const bloqueado = a.destino === "EN_PRODUCCION" && motivoBloqueoInicio !== "";
                const deshabilitado = !a.permitida || bloqueado || guardando;
                const titulo = !a.permitida
                  ? "No tienes permiso para esta acción"
                  : bloqueado ? motivoBloqueoInicio : undefined;
                return (
                  <button
                    key={a.destino}
                    type="button"
                    className={`ts-btn${a.destino === "CANCELADA" ? " ts-btn-danger" : a.destino === "PLANIFICADA" || a.destino === "EN_PRODUCCION" ? " ts-btn-primary" : ""}`}
                    disabled={deshabilitado}
                    title={titulo}
                    onClick={() => { setAccion(a); setMotivo(""); setErrorAccion(""); }}
                  >
                    {a.verbo}
                  </button>
                );
              })}
            </div>
          </div>
          {motivoBloqueoInicio && <p className="ts-empty" role="note">No se puede iniciar: {motivoBloqueoInicio}</p>}
        </div>
      )}

      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title"><h2>Materiales requeridos</h2><span>{materiales.length} líneas</span></div>
        {materiales.length === 0 ? (
          <p className="ts-empty">Esta orden no tiene materiales asociados.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Materiales requeridos con disponibilidad</caption>
              <thead>
                <tr><th scope="col">Código</th><th scope="col">Material</th><th scope="col">Requerido</th><th scope="col">Disponible</th><th scope="col">Estado</th></tr>
              </thead>
              <tbody>
                {materiales.map((m) => {
                  const disp = disponibilidad.find((d) => Number(d.id) === Number(m.id));
                  return (
                    <tr key={m.id}>
                      <td className="ts-code">{m.codigo}</td>
                      <td>{m.nombre}</td>
                      <td>{mostrarCantidad(m.requerida)} {m.unidad}</td>
                      <td>{disp?.disponible == null ? "—" : `${mostrarCantidad(disp.disponible)} ${disp.unidad || m.unidad}`}</td>
                      <td>{disp?.estado ? <BadgeDisponibilidad estado={disp.estado} /> : <span>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title"><h2>Avance de producción</h2><span>Acumulado {mostrarCantidad(total)} de {mostrarCantidad(solicitada)}</span></div>
        <div style={{ padding: "4px 20px 16px" }}>
          <BarraAvance acumulado={total} solicitada={Number(solicitada) || 0} />
          {enProduccion && permiteAvance ? (
            <form onSubmit={guardarAvance} style={{ marginTop: 12 }}>
              <label htmlFor="avance-cantidad" style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 320, color: "#535860", fontSize: ".76rem" }}>
                Cantidad producida
                <input
                  id="avance-cantidad"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={cantidadAvance}
                  onChange={(e) => setCantidadAvance(e.target.value)}
                  disabled={guardandoAvance}
                  style={{ minHeight: 36, padding: "7px 10px", border: "1px solid #e0e0e2", borderRadius: 5, background: "#f4f4f5" }}
                />
              </label>
              {errorAvance && <p className="ts-modal-error" role="alert">{errorAvance}</p>}
              <div className="ts-btn-group" style={{ marginTop: 10 }}>
                <button type="submit" className="ts-btn ts-btn-primary" disabled={guardandoAvance}>
                  {guardandoAvance ? "Registrando…" : "Registrar avance"}
                </button>
              </div>
            </form>
          ) : (
            <p className="ts-empty">
              {enProduccion
                ? "No tienes permiso para registrar avances."
                : `El avance solo se registra en estado En producción (actual: ${mostrarEstadoOrden(orden.estado)}).`}
            </p>
          )}
          {Array.isArray(avances) && avances.length > 0 && (
            <div className="ts-table-wrap" style={{ margin: "12px 0 0" }}>
              <table className="ts-table">
                <caption>Avances registrados</caption>
                <thead><tr><th scope="col">Cantidad</th><th scope="col">Fecha</th><th scope="col">Hora</th></tr></thead>
                <tbody>
                  {avances.map((a, i) => {
                    const { fecha, hora } = mostrarFechaHora(a.fecha_hora ?? a.fechaHora ?? a.creado_en ?? a.createdAt);
                    return (
                      <tr key={a.id ?? i}>
                        <td>{mostrarCantidad(a.cantidad ?? a.cantidad_producida ?? a.cantidadProducida)}</td>
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
      </div>

      <div className="ts-panel">
        <div className="ts-panel-title"><h2>Historial de estados</h2><span>{historial.length} movimientos</span></div>
        {historial.length === 0 ? (
          <p className="ts-empty">Todavía no hay movimientos registrados.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Historial de estados de la orden</caption>
              <thead>
                <tr><th scope="col">Anterior</th><th scope="col">Nuevo</th><th scope="col">Fecha</th><th scope="col">Hora</th><th scope="col">Usuario</th><th scope="col">Motivo</th></tr>
              </thead>
              <tbody>
                {historial.map((h) => {
                  const { fecha, hora } = mostrarFechaHora(h.fechaHora);
                  return (
                    <tr key={h.id}>
                      <td>{h.anterior ? mostrarEstadoOrden(h.anterior) : "—"}</td>
                      <td><BadgeEstadoOrden estado={h.nuevo} /></td>
                      <td>{fecha}</td>
                      <td>{hora}</td>
                      <td>{h.usuario}</td>
                      <td>{h.motivo || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {accion && (
        <div className="ts-modal-overlay">
          <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="accion-titulo">
            <h2 id="accion-titulo">Confirmar {ETIQUETAS[accion.destino]?.titulo ?? accion.destino}</h2>
            <p>¿Quieres {((ETIQUETAS[accion.destino]?.verbo ?? accion.destino).toLowerCase())} la orden {orden.codigo}?</p>
            <form onSubmit={confirmarAccion}>
              {accion.destino === "CANCELADA" && (
                <label htmlFor="motivo-cancelacion">Motivo de cancelación *
                  <textarea id="motivo-cancelacion" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} required disabled={guardando} />
                </label>
              )}
              {errorAccion && <p className="ts-modal-error" role="alert">{errorAccion}</p>}
              <div className="ts-modal-actions">
                <button type="button" className="ts-btn" onClick={() => setAccion(null)} disabled={guardando}>Volver</button>
                <button type="submit" className={`ts-btn${accion.destino === "CANCELADA" ? " ts-btn-danger" : " ts-btn-primary"}`} disabled={guardando}>
                  {guardando ? "Guardando…" : `Confirmar ${ETIQUETAS[accion.destino]?.titulo ?? ""}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
