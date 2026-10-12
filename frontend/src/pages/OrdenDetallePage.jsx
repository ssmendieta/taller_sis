
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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
import {
  listarConsumosOrden,
  obtenerTotalesConsumos,
  registrarConsumo,
} from "../services/consumosService.js";
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
  mostrarFechaHora,
  nombreProductoOrden,
  responsableOrden,
  totalProducidoDe,
} from "../utils/formato.js";
import { formatearCantidad, formatearEstadoOrden, formatearFecha } from "../utils/format.js";
import { BadgeDisponibilidad, BadgeEstadoOrden, BarraAvance } from "../components/ui/Badges.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

const ETIQUETAS = {
  PLANIFICADA: { titulo: "planificación", verbo: "Planificar" },
  EN_PRODUCCION: { titulo: "inicio de producción", verbo: "Iniciar producción" },
  FINALIZADA: { titulo: "finalización", verbo: "Finalizar" },
  CANCELADA: { titulo: "cancelación", verbo: "Cancelar" },
};

function materialIdDeConsumo(consumo) {
  return Number(consumo.materialId ?? consumo.material_id ?? consumo.material?.id);
}

function cantidadTotalDeConsumo(resumen) {
  return Number(resumen?.cantidadTotal ?? resumen?.cantidad_total ?? 0);
}

export default function OrdenDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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

  // ABC: captura y consulta del consumo real de materiales.
  const [consumos, setConsumos] = useState([]);
  const [totalesConsumo, setTotalesConsumo] = useState([]);
  const [materialConsumo, setMaterialConsumo] = useState("");
  const [cantidadConsumo, setCantidadConsumo] = useState("");
  const [guardandoConsumo, setGuardandoConsumo] = useState(false);
  const [errorConsumo, setErrorConsumo] = useState("");
  const [avisoConsumo, setAvisoConsumo] = useState("");

  const muestraAcciones = puedeVerAcciones(usuario);
  const permiteAvance = puedeRegistrarAvance(usuario);
  const permiteConsumo = tienePermiso(usuario, "materiales.registrar_consumo");

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

      // Disponibilidad y avance no bloquean el detalle si fallan.
      try {
        const disp = await obtenerDisponibilidadOrden(id);
        setDisponibilidad(materialesNormalizados(disp));
      } catch {
        setDisponibilidad([]);
      }

      try {
        setTotal(totalProducidoDe(await obtenerTotalProducido(id)));
      } catch {
        setTotal(Number(detalle?.avance?.acumulado ?? 0));
      }

      try {
        setAvances(await obtenerAvancesOrden(id).catch(() => []));
      } catch {
        setAvances([]);
      }

      // Carga de registros y totales de consumo.
      try {
        const [registros, resumen] = await Promise.all([
          listarConsumosOrden(id),
          obtenerTotalesConsumos(id),
        ]);

        setConsumos(Array.isArray(registros) ? registros : []);
        setTotalesConsumo(Array.isArray(resumen) ? resumen : []);
      } catch {
        setConsumos([]);
        setTotalesConsumo([]);
      }

      // Estado de la receta para explicar el bloqueo de Inicio.
      const recetaId =
        detalle?.producto_id ?? detalle?.receta_id ?? detalle?.productoId;

      if (recetaId != null && tienePermiso(usuario, "recetas.gestionar")) {
        try {
          const recetas = await obtenerRecetas();
          const receta = (Array.isArray(recetas) ? recetas : []).find(
            (r) => Number(r.id) === Number(recetaId),
          );
          setRecetaActiva(receta ? Boolean(receta.activa) : null);
        } catch {
          setRecetaActiva(null);
        }
      }
    } catch (fallo) {
      setError(fallo.message || "No se pudo cargar el detalle de la orden.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();

    if (location.state?.exito) {
      setAviso(location.state.exito);
      navigate(location.pathname, { replace: true });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    document.title = FORMATO_TITULO(
      orden?.codigo ? `Orden ${orden.codigo}` : "Orden",
    );
  }, [orden?.codigo]);

  const solicitada = cantidadSolicitadaOrden(orden);
  const unidad =
    orden?.unidad_producto ??
    orden?.unidad_medida ??
    orden?.producto?.unidad_producto ??
    "";

  const faltantes = useMemo(
    () =>
      disponibilidad.filter(
        (m) => m.estado === "INSUFICIENTE" || m.estado === "FALTANTE",
      ),
    [disponibilidad],
  );

  const motivoBloqueoInicio = useMemo(() => {
    if (orden?.estado !== "PLANIFICADA") return "";
    if (recetaActiva === false) return "La receta de esta orden está inactiva.";

    if (faltantes.length > 0) {
      const nombres = faltantes
        .map(
          (m) =>
            `${m.codigo} (${mostrarCantidad(m.requerida)} ${m.unidad}, disponible ${mostrarCantidad(m.disponible)})`.trim(),
        )
        .join(", ");

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
      await cambiarEstadoOrden(
        id,
        accion.destino,
        accion.destino === "CANCELADA" ? motivo.trim() : undefined,
      );

      setAviso(`Orden ${mostrarEstadoOrden(accion.destino).toLowerCase()}.`);
      setAccion(null);
      setMotivo("");
      await cargar();
    } catch (fallo) {
      setErrorAccion(
        fallo.message || "No se pudo cambiar el estado de la orden.",
      );
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
      setErrorAvance(
        `La cantidad supera lo solicitado. Restan ${formatearCantidad(restante, unidad)}.`,
      );
      return;
    }

    setGuardandoAvance(true);

    try {
      await registrarAvance(id, cantidad);
      setCantidadAvance("");
      setAviso("Avance registrado.");
      await cargar();
    } catch (fallo) {
      setErrorAvance(fallo.message || "No se pudo registrar el avance.");
    } finally {
      setGuardandoAvance(false);
    }
  }

  async function guardarConsumo(evento) {
    evento.preventDefault();

    if (guardandoConsumo) return;

    setErrorConsumo("");
    setAvisoConsumo("");

    const cantidad = Number(cantidadConsumo);
    const material = materiales.find(
      (m) => Number(m.id) === Number(materialConsumo),
    );

    if (!material) {
      setErrorConsumo("Selecciona un material válido de la receta.");
      return;
    }

    if (
      !cantidadConsumo ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0
    ) {
      setErrorConsumo("La cantidad debe ser mayor a cero.");
      return;
    }

    if (Number(cantidad.toFixed(4)) !== cantidad) {
      setErrorConsumo("La cantidad admite como máximo 4 decimales.");
      return;
    }

    if (!material.unidad) {
      setErrorConsumo("No se pudo determinar la unidad del material.");
      return;
    }

    setGuardandoConsumo(true);

    try {
      await registrarConsumo({
        ordenId: Number(id),
        materialId: Number(material.id),
        cantidad,
        unidad: material.unidad,
      });

      setCantidadConsumo("");
      setAvisoConsumo("Consumo registrado correctamente.");

      const [registros, resumen] = await Promise.all([
        listarConsumosOrden(id),
        obtenerTotalesConsumos(id),
      ]);

      setConsumos(Array.isArray(registros) ? registros : []);
      setTotalesConsumo(Array.isArray(resumen) ? resumen : []);
    } catch (fallo) {
      setErrorConsumo(
        fallo.message || "No se pudo registrar el consumo.",
      );
    } finally {
      setGuardandoConsumo(false);
    }
  }

  if (cargando) {
    return (
      <p className="ts-feedback" role="status">
        Cargando detalle de la orden…
      </p>
    );
  }

  if (error) {
    return (
      <div className="ts-feedback ts-error" role="alert">
        <p>{error}</p>
        <div className="ts-btn-group">
          <button type="button" className="ts-btn" onClick={cargar}>
            Reintentar
          </button>
          <Link className="ts-btn" to="/ordenes">
            Volver
          </Link>
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
        accion={
          <Link className="ts-btn" to="/ordenes">
            Volver
          </Link>
        }
      />

      {aviso && <p className="ts-success" role="status">{aviso}</p>}

      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title">
          <h2 id="detalle-orden-titulo">Datos generales</h2>
          <BadgeEstadoOrden estado={orden.estado} />
        </div>

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Datos generales de la orden</caption>
            <tbody>
              <tr>
                <th scope="row">Código</th>
                <td className="ts-code">{orden.codigo ?? "—"}</td>
              </tr>
              <tr>
                <th scope="row">Producto</th>
                <td>{nombreProductoOrden(orden)}</td>
              </tr>
              <tr>
                <th scope="row">Cantidad solicitada</th>
                <td>{formatearCantidad(solicitada, unidad)}</td>
              </tr>
              <tr>
                <th scope="row">Fecha programada</th>
                <td>{formatearFecha(fechaProgramadaOrden(orden))}</td>
              </tr>
              <tr>
                <th scope="row">Responsable</th>
                <td>{responsableOrden(orden)}</td>
              </tr>
              <tr>
                <th scope="row">Avance</th>
                <td>
                  <BarraAvance
                    acumulado={total}
                    solicitada={Number(solicitada) || 0}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {muestraAcciones && acciones.length > 0 && (
        <div className="ts-panel" style={{ marginBottom: 16 }}>
          <div className="ts-panel-title">
            <h2>Acciones</h2>
          </div>

          <div className="ts-filters">
            <div className="ts-btn-group">
              {acciones.map((a) => {
                const bloqueado =
                  a.destino === "EN_PRODUCCION" &&
                  motivoBloqueoInicio !== "";
                const deshabilitado = !a.permitida || bloqueado || guardando;
                const titulo = !a.permitida
                  ? "No tienes permiso para esta acción"
                  : bloqueado
                    ? motivoBloqueoInicio
                    : undefined;

                return (
                  <button
                    key={a.destino}
                    type="button"
                    className={`ts-btn${a.destino === "CANCELADA" ? " ts-btn-danger" : a.destino === "PLANIFICADA" || a.destino === "EN_PRODUCCION" ? " ts-btn-primary" : ""}`}
                    disabled={deshabilitado}
                    title={titulo}
                    onClick={() => {
                      setAccion(a);
                      setMotivo("");
                      setErrorAccion("");
                    }}
                  >
                    {a.verbo}
                  </button>
                );
              })}
            </div>
          </div>

          {motivoBloqueoInicio && (
            <p className="ts-field-help" role="note">
              {motivoBloqueoInicio}
            </p>
          )}
        </div>
      )}

      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title">
          <h2>Materiales requeridos</h2>
          <span>{materiales.length} líneas</span>
        </div>

        {materiales.length === 0 ? (
          <p className="ts-empty">Sin materiales.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Materiales requeridos con disponibilidad</caption>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Material</th>
                  <th scope="col">Requerido</th>
                  <th scope="col">Disponible</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {materiales.map((m) => {
                  const disp = disponibilidad.find(
                    (d) => Number(d.id) === Number(m.id),
                  );

                  return (
                    <tr key={m.id}>
                      <td className="ts-code">{m.codigo}</td>
                      <td>{m.nombre}</td>
                      <td>{mostrarCantidad(m.requerida)} {m.unidad}</td>
                      <td>
                        {disp?.disponible == null
                          ? "—"
                          : formatearCantidad(
                              disp.disponible,
                              disp.unidad || m.unidad,
                            )}
                      </td>
                      <td>
                        {disp?.estado ? (
                          <BadgeDisponibilidad estado={disp.estado} />
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ABC: registro de consumos reales y comparación con la receta. */}
      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title">
          <h2>Consumo real de materiales</h2>
          <span>{consumos.length} registros</span>
        </div>

        {enProduccion && permiteConsumo ? (
          <form
            onSubmit={guardarConsumo}
            style={{ padding: "12px 20px 16px" }}
          >
            <label
              htmlFor="material-consumo"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: 420,
                marginBottom: 12,
              }}
            >
              Material
              <select
                id="material-consumo"
                value={materialConsumo}
                onChange={(e) => setMaterialConsumo(e.target.value)}
                required
                disabled={guardandoConsumo}
                style={{
                  minHeight: 38,
                  padding: "7px 10px",
                  border: "1px solid #e0e0e2",
                  borderRadius: 5,
                }}
              >
                <option value="">Selecciona un material</option>
                {materiales.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.codigo}) — {m.unidad}
                  </option>
                ))}
              </select>
            </label>

            <label
              htmlFor="cantidad-consumo"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: 320,
              }}
            >
              Cantidad utilizada
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  id="cantidad-consumo"
                  type="number"
                  min="0.0001"
                  max="9999999999.9999"
                  step="0.0001"
                  value={cantidadConsumo}
                  onChange={(e) => setCantidadConsumo(e.target.value)}
                  required
                  disabled={guardandoConsumo}
                  style={{
                    minHeight: 36,
                    padding: "7px 10px",
                    border: "1px solid #e0e0e2",
                    borderRadius: 5,
                    flex: 1,
                  }}
                />
                <span>
                  {materiales.find(
                    (m) => Number(m.id) === Number(materialConsumo),
                  )?.unidad ?? ""}
                </span>
              </div>
            </label>

            {errorConsumo && (
              <p className="ts-modal-error" role="alert">
                {errorConsumo}
              </p>
            )}

            {avisoConsumo && (
              <p className="ts-success" role="status">
                {avisoConsumo}
              </p>
            )}

            <div className="ts-btn-group" style={{ marginTop: 12 }}>
              <button
                type="submit"
                className="ts-btn ts-btn-primary"
                disabled={guardandoConsumo || materiales.length === 0}
              >
                {guardandoConsumo ? "Registrando…" : "Registrar consumo"}
              </button>
            </div>
          </form>
        ) : (
          <p className="ts-empty">
            {!enProduccion
              ? "El consumo solo se registra durante la producción."
              : "No tienes permiso para registrar consumos."}
          </p>
        )}

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Consumos acumulados y desviación frente a lo requerido</caption>
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col">Requerido</th>
                <th scope="col">Consumido</th>
                <th scope="col">Desviación</th>
              </tr>
            </thead>
            <tbody>
              {materiales.map((m) => {
                const resumen = totalesConsumo.find(
                  (t) =>
                    Number(t.materialId ?? t.material_id) === Number(m.id),
                );
                const consumido = cantidadTotalDeConsumo(resumen);
                const requerido = Number(m.requerida ?? 0);
                const desviacion = consumido - requerido;

                return (
                  <tr key={m.id}>
                    <td>{m.nombre}</td>
                    <td>{mostrarCantidad(requerido)} {m.unidad}</td>
                    <td>{mostrarCantidad(consumido)} {m.unidad}</td>
                    <td>
                      {desviacion > 0 ? "+" : ""}
                      {mostrarCantidad(desviacion)} {m.unidad}
                    </td>
                  </tr>
                );
              })}
              {materiales.length === 0 && (
                <tr>
                  <td colSpan={4}>No hay materiales asociados a esta orden.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Historial de registros de consumo</caption>
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Fecha</th>
                <th scope="col">Hora</th>
              </tr>
            </thead>
            <tbody>
              {consumos.map((c, i) => {
                const { fecha, hora } = mostrarFechaHora(
                  c.fechaHora ?? c.fecha_hora ?? c.createdAt,
                );
                const material = materiales.find(
                  (m) => Number(m.id) === materialIdDeConsumo(c),
                );

                return (
                  <tr key={c.id ?? i}>
                    <td>{c.material?.nombre ?? material?.nombre ?? "Material"}</td>
                    <td>
                      {mostrarCantidad(c.cantidad)} {c.unidad}
                    </td>
                    <td>{fecha}</td>
                    <td>{hora}</td>
                  </tr>
                );
              })}
              {consumos.length === 0 && (
                <tr>
                  <td colSpan={4}>Todavía no hay consumos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title">
          <h2>Avance</h2>
          <span>
            {formatearCantidad(total, unidad)} de{" "}
            {formatearCantidad(solicitada, unidad)}
          </span>
        </div>

        <div style={{ padding: "4px 20px 16px" }}>
          <BarraAvance
            acumulado={total}
            solicitada={Number(solicitada) || 0}
          />

          {enProduccion && permiteAvance ? (
            <form onSubmit={guardarAvance} style={{ marginTop: 12 }}>
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
                    max={Math.max(Number(solicitada) - Number(total), 0) || undefined}
                    value={cantidadAvance}
                    onChange={(e) => setCantidadAvance(e.target.value)}
                    disabled={guardandoAvance}
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

              {errorAvance && (
                <p className="ts-modal-error" role="alert">{errorAvance}</p>
              )}

              <div className="ts-btn-group" style={{ marginTop: 10 }}>
                <button
                  type="submit"
                  className="ts-btn ts-btn-primary"
                  disabled={guardandoAvance}
                >
                  {guardandoAvance ? "Registrando…" : "Registrar avance"}
                </button>

                <button
                  type="button"
                  className="ts-btn"
                  disabled={
                    guardandoAvance ||
                    !(Number(solicitada) - Number(total) > 0)
                  }
                  onClick={() =>
                    setCantidadAvance(
                      String(Math.max(Number(solicitada) - Number(total), 0)),
                    )
                  }
                >
                  Completar restante
                </button>
              </div>
            </form>
          ) : (
            <p className="ts-empty">
              {enProduccion
                ? "Sin permiso para registrar avances."
                : `Solo se registra en estado En producción (actual: ${mostrarEstadoOrden(orden.estado)}).`}
            </p>
          )}

          {Array.isArray(avances) && avances.length > 0 && (
            <div className="ts-table-wrap" style={{ margin: "12px 0 0" }}>
              <table className="ts-table">
                <caption>Avances registrados</caption>
                <thead>
                  <tr>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {avances.map((a, i) => {
                    const { fecha, hora } = mostrarFechaHora(
                      a.fecha_hora ?? a.fechaHora ?? a.creado_en ?? a.createdAt,
                    );

                    return (
                      <tr key={a.id ?? i}>
                        <td>
                          {formatearCantidad(
                            a.cantidad ?? a.cantidad_producida ?? a.cantidadProducida,
                            unidad,
                          )}
                        </td>
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
        <div className="ts-panel-title">
          <h2>Historial</h2>
          <span>{historial.length} movimientos</span>
        </div>

        {historial.length === 0 ? (
          <p className="ts-empty">Sin movimientos.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Historial de estados de la orden</caption>
              <thead>
                <tr>
                  <th scope="col">Anterior</th>
                  <th scope="col">Nuevo</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Hora</th>
                  <th scope="col">Usuario</th>
                  <th scope="col">Motivo</th>
                </tr>
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
          <div
            className="ts-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accion-titulo"
          >
            <h2 id="accion-titulo">
              {ETIQUETAS[accion.destino]?.verbo ?? accion.destino} orden{" "}
              {orden.codigo}
            </h2>

            <p>
              {accion.destino === "CANCELADA"
                ? "La orden quedará cancelada y no se podrá producir."
                : `La orden pasará a ${mostrarEstadoOrden(accion.destino).toLowerCase()}.`}
            </p>

            <form onSubmit={confirmarAccion}>
              {accion.destino === "CANCELADA" && (
                <label htmlFor="motivo-cancelacion">
                  Motivo de cancelación *
                  <textarea
                    id="motivo-cancelacion"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={500}
                    required
                    disabled={guardando}
                  />
                </label>
              )}

              {errorAccion && (
                <p className="ts-modal-error" role="alert">{errorAccion}</p>
              )}

              <div className="ts-modal-actions">
                <button
                  type="button"
                  className="ts-btn"
                  onClick={() => setAccion(null)}
                  disabled={guardando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className={`ts-btn${accion.destino === "CANCELADA" ? " ts-btn-danger" : " ts-btn-primary"}`}
                  disabled={guardando}
                >
                  {guardando
                    ? "Guardando…"
                    : ETIQUETAS[accion.destino]?.verbo ?? "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
