
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
  obtenerComparacionMateriales,
  registrarConsumo,
} from "../services/consumosService.js";
import {
  MAX_CAUSA_DEFECTO,
  TIPO_CONFORME,
  TIPO_DEFECTUOSO,
  listarResultadosCalidad,
  registrarConforme,
  registrarDefecto,
  resumenCalidad,
  sumarCantidades,
} from "../services/calidadService.js";
import { MAX_CODIGO_LOTE, crearLote, listarLotesOrden } from "../services/lotesService.js";
import { PERMISO_CONSULTAR_BOLETAS } from "../services/boletasService.js";
import {
  ESTADOS_REPORTE_CONTABLE,
  PERMISO_PREPARAR_CIERRE,
  VERSION_CIERRE_INICIAL,
  estadoReporteContable,
  obtenerCierre,
  prepararCierre,
} from "../services/cierreProduccionService.js";
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
import { filasComparacionMateriales, formatearCantidad, formatearEstadoOrden, formatearFecha } from "../utils/format.js";
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

// La API solo devuelve el id del responsable; si es quien consulta se muestra su nombre.
function responsableDeResultado(resultado, usuario) {
  const id = resultado.responsableUsuarioId ?? resultado.responsable_usuario_id;
  if (id == null) return "—";
  if (usuario?.id != null && String(usuario.id) === String(id)) {
    return usuario.nombre_completo ?? usuario.nombre ?? `Usuario ${id}`;
  }
  return `Usuario ${id}`;
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
  // ABC-72: comparación requerido/utilizado calculada por la API.
  const [comparacion, setComparacion] = useState([]);
  const [errorComparacion, setErrorComparacion] = useState("");
  const [materialConsumo, setMaterialConsumo] = useState("");
  const [cantidadConsumo, setCantidadConsumo] = useState("");
  const [guardandoConsumo, setGuardandoConsumo] = useState(false);
  const [errorConsumo, setErrorConsumo] = useState("");
  const [avisoConsumo, setAvisoConsumo] = useState("");

  // ABC-82 y ABC-83: unidades conformes y defectuosas con causa, por separado.
  const [conformesCalidad, setConformesCalidad] = useState([]);
  const [defectosCalidad, setDefectosCalidad] = useState([]);
  const [errorCargaCalidad, setErrorCargaCalidad] = useState("");
  const [cantidadConforme, setCantidadConforme] = useState("");
  const [guardandoConforme, setGuardandoConforme] = useState(false);
  const [errorConforme, setErrorConforme] = useState("");
  const [avisoConforme, setAvisoConforme] = useState("");
  const [cantidadDefecto, setCantidadDefecto] = useState("");
  const [causaDefecto, setCausaDefecto] = useState("");
  const [guardandoDefecto, setGuardandoDefecto] = useState(false);
  const [errorDefecto, setErrorDefecto] = useState("");
  const [avisoDefecto, setAvisoDefecto] = useState("");

  // ABC-294: lotes que identifican unidades conformes.
  const [lotes, setLotes] = useState([]);
  const [errorCargaLotes, setErrorCargaLotes] = useState("");
  const [codigoLote, setCodigoLote] = useState("");
  const [cantidadLote, setCantidadLote] = useState("");
  const [guardandoLote, setGuardandoLote] = useState(false);
  const [errorLote, setErrorLote] = useState("");
  const [avisoLote, setAvisoLote] = useState("");

  // ABC-299: resumen de cierre (snapshot inmutable) de la orden FINALIZADA.
  const [cierre, setCierre] = useState(null);
  const [estadoCierre, setEstadoCierre] = useState("cargando");
  const [errorCargaCierre, setErrorCargaCierre] = useState("");
  const [preparandoCierre, setPreparandoCierre] = useState(false);
  const [errorCierre, setErrorCierre] = useState("");
  const [avisoCierre, setAvisoCierre] = useState("");
  const [actualizandoReporte, setActualizandoReporte] = useState(false);

  const muestraAcciones = puedeVerAcciones(usuario);
  const permiteAvance = puedeRegistrarAvance(usuario);
  const permiteConsumo = tienePermiso(usuario, "materiales.registrar_consumo");
  // El mismo permiso de calidad registra conformes y defectuosos.
  const permiteCalidad = tienePermiso(usuario, "calidad.registrar_conformes");
  const permiteCierre = tienePermiso(usuario, PERMISO_PREPARAR_CIERRE);
  const permiteTrazabilidad = tienePermiso(usuario, PERMISO_CONSULTAR_BOLETAS);

  async function cargarCalidad() {
    try {
      const [conformes, defectuosos] = await Promise.all([
        listarResultadosCalidad(id, TIPO_CONFORME),
        listarResultadosCalidad(id, TIPO_DEFECTUOSO),
      ]);

      setConformesCalidad(Array.isArray(conformes) ? conformes : []);
      setDefectosCalidad(Array.isArray(defectuosos) ? defectuosos : []);
      setErrorCargaCalidad("");
    } catch (fallo) {
      setConformesCalidad([]);
      setDefectosCalidad([]);
      setErrorCargaCalidad(
        fallo.message || "No se pudieron cargar los resultados de calidad.",
      );
    }
  }

  async function cargarComparacion() {
    try {
      const respuesta = await obtenerComparacionMateriales(id);
      setComparacion(Array.isArray(respuesta?.materiales) ? respuesta.materiales : []);
      setErrorComparacion("");
    } catch (fallo) {
      setComparacion([]);
      setErrorComparacion(
        fallo.status === 409
          ? `${fallo.message}. Las unidades no coinciden, así que no se suman ni se comparan.`
          : fallo.message || "No se pudo cargar la comparación de materiales.",
      );
    }
  }

  async function cargarLotes(ordenCodigo) {
    try {
      const respuesta = await listarLotesOrden(ordenCodigo);
      setLotes(Array.isArray(respuesta) ? respuesta : []);
      setErrorCargaLotes("");
    } catch (fallo) {
      setLotes([]);
      setErrorCargaLotes(fallo.message || "No se pudieron cargar los lotes de la orden.");
    }
  }

  // 404 significa que la versión todavía no se preparó; otros fallos se informan.
  async function cargarCierre() {
    try {
      setCierre(await obtenerCierre(id, VERSION_CIERRE_INICIAL));
      setEstadoCierre("preparado");
      setErrorCargaCierre("");
    } catch (fallo) {
      setCierre(null);
      if (fallo.status === 404) {
        setEstadoCierre("sin-preparar");
        setErrorCargaCierre("");
      } else {
        setEstadoCierre("error");
        setErrorCargaCierre(fallo.message || "No se pudo cargar el resumen de cierre.");
      }
    }
  }

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

      // Registros de consumo y comparación con lo requerido por la receta.
      try {
        const registros = await listarConsumosOrden(id);
        setConsumos(Array.isArray(registros) ? registros : []);
      } catch {
        setConsumos([]);
      }

      await cargarComparacion();

      await cargarCalidad();
      if (detalle?.codigo) await cargarLotes(detalle.codigo);
      await cargarCierre();

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

  const calidad = useMemo(
    () => resumenCalidad(total, conformesCalidad, defectosCalidad),
    [total, conformesCalidad, defectosCalidad],
  );

  // Conformes sin asignar = conformes registrados − cantidades ya asignadas a lotes.
  const resumenLotes = useMemo(() => {
    const asignadas = sumarCantidades(lotes);
    const sinAsignar =
      (Math.round(calidad.conformes * 10000) - Math.round(asignadas * 10000)) / 10000;
    return { asignadas, sinAsignar: Math.max(sinAsignar, 0) };
  }, [lotes, calidad.conformes]);

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

      const [registros] = await Promise.all([
        listarConsumosOrden(id),
        cargarComparacion(),
      ]);

      setConsumos(Array.isArray(registros) ? registros : []);
    } catch (fallo) {
      setErrorConsumo(
        fallo.message || "No se pudo registrar el consumo.",
      );
    } finally {
      setGuardandoConsumo(false);
    }
  }

  async function guardarConforme(evento) {
    evento.preventDefault();

    if (guardandoConforme) return;

    setErrorConforme("");
    setAvisoConforme("");

    const cantidad = Number(cantidadConforme);

    if (!cantidadConforme || !Number.isFinite(cantidad) || cantidad <= 0) {
      setErrorConforme("La cantidad conforme debe ser mayor a cero.");
      return;
    }

    if (Number(cantidad.toFixed(4)) !== cantidad) {
      setErrorConforme("La cantidad admite como máximo 4 decimales.");
      return;
    }

    if (cantidad > calidad.porClasificar) {
      setErrorConforme(
        `No se pueden registrar ${formatearCantidad(cantidad, unidad)}: hay ${formatearCantidad(calidad.producido, unidad)} producidas según los avances y ${formatearCantidad(calidad.producido - calidad.porClasificar, unidad)} ya clasificadas, así que quedan ${formatearCantidad(calidad.porClasificar, unidad)} pendientes de clasificación.`,
      );
      return;
    }

    setGuardandoConforme(true);

    try {
      await registrarConforme({ ordenId: Number(id), cantidad });
      setCantidadConforme("");
      setAvisoConforme("Unidades conformes registradas correctamente.");
    } catch (fallo) {
      setErrorConforme(
        fallo.message || "No se pudieron registrar las unidades conformes.",
      );
    } finally {
      // Con éxito o rechazo, el resumen refleja lo que guarda la API.
      await cargarCalidad();
      setGuardandoConforme(false);
    }
  }

  // La respuesta de Contabilidad llega después por Pub/Sub: se vuelve a leer el cierre.
  async function actualizarReporteContable() {
    setActualizandoReporte(true);
    await cargarCierre();
    setActualizandoReporte(false);
  }

  async function prepararResumenCierre() {
    if (preparandoCierre) return;

    setErrorCierre("");
    setAvisoCierre("");
    setPreparandoCierre(true);

    try {
      const snapshot = await prepararCierre(Number(id), VERSION_CIERRE_INICIAL);
      setAvisoCierre(
        `Resumen de cierre versión ${snapshot?.cierreVersion ?? VERSION_CIERRE_INICIAL} preparado.`,
      );
    } catch (fallo) {
      setErrorCierre(fallo.message || "No se pudo preparar el resumen de cierre.");
    } finally {
      // Con éxito o con 409, se muestra el snapshot que realmente guarda la API.
      await cargarCierre();
      setPreparandoCierre(false);
    }
  }

  async function guardarLote(evento) {
    evento.preventDefault();

    if (guardandoLote) return;

    setErrorLote("");
    setAvisoLote("");

    const codigo = codigoLote.trim();
    const cantidad = Number(cantidadLote);

    if (!codigo) {
      setErrorLote("Indica el código del lote.");
      return;
    }

    if (!cantidadLote || !Number.isFinite(cantidad) || cantidad <= 0) {
      setErrorLote("La cantidad del lote debe ser mayor a cero.");
      return;
    }

    if (Number(cantidad.toFixed(4)) !== cantidad) {
      setErrorLote("La cantidad admite como máximo 4 decimales.");
      return;
    }

    if (cantidad > resumenLotes.sinAsignar) {
      setErrorLote(
        `No se pueden asignar ${formatearCantidad(cantidad, unidad)}: hay ${formatearCantidad(calidad.conformes, unidad)} conformes y ${formatearCantidad(resumenLotes.asignadas, unidad)} ya asignadas a lotes, así que quedan ${formatearCantidad(resumenLotes.sinAsignar, unidad)} sin asignar.`,
      );
      return;
    }

    setGuardandoLote(true);

    try {
      const lote = await crearLote({ ordenId: Number(id), codigo, cantidad });
      setCodigoLote("");
      setCantidadLote("");
      setAvisoLote(
        `Lote ${lote?.codigo ?? codigo} creado con ${formatearCantidad(lote?.cantidad ?? cantidad, unidad)}.`,
      );
    } catch (fallo) {
      setErrorLote(fallo.message || "No se pudo crear el lote.");
    } finally {
      // Con éxito o rechazo, la lista refleja lo que guarda la API.
      await cargarLotes(orden.codigo);
      setGuardandoLote(false);
    }
  }

  async function guardarDefecto(evento) {
    evento.preventDefault();

    if (guardandoDefecto) return;

    setErrorDefecto("");
    setAvisoDefecto("");

    const cantidad = Number(cantidadDefecto);
    const causa = causaDefecto.trim();

    if (!cantidadDefecto || !Number.isFinite(cantidad) || cantidad <= 0) {
      setErrorDefecto("La cantidad defectuosa debe ser mayor a cero.");
      return;
    }

    if (Number(cantidad.toFixed(4)) !== cantidad) {
      setErrorDefecto("La cantidad admite como máximo 4 decimales.");
      return;
    }

    if (!causa) {
      setErrorDefecto("Indica la causa del defecto.");
      return;
    }

    if (cantidad > calidad.porClasificar) {
      setErrorDefecto(
        `Conformes y defectuosas no pueden superar lo producido. Quedan ${formatearCantidad(calidad.porClasificar, unidad)} pendientes de clasificación.`,
      );
      return;
    }

    setGuardandoDefecto(true);

    try {
      await registrarDefecto({
        ordenId: Number(id),
        cantidad,
        causaDefecto: causa,
      });

      setCantidadDefecto("");
      setCausaDefecto("");
      setAvisoDefecto("Defecto registrado correctamente.");
    } catch (fallo) {
      setErrorDefecto(fallo.message || "No se pudo registrar el defecto.");
    } finally {
      // Con éxito o rechazo, el resumen refleja lo que guarda la API.
      await cargarCalidad();
      setGuardandoDefecto(false);
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
  const reporteContable = estadoReporteContable(cierre);

  return (
    <section className="ts-page" aria-labelledby="detalle-orden-titulo">
      <PageHeader
        titulo={`Orden ${orden.codigo ?? ""}`}
        accion={
          <div className="ts-btn-group">
            {permiteTrazabilidad && (
              <Link className="ts-btn" to={`/ordenes/${id}/trazabilidad`}>
                Trazabilidad documental
              </Link>
            )}
            <Link className="ts-btn" to="/ordenes">
              Volver
            </Link>
          </div>
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

        <p className="ts-field-help" role="note" style={{ padding: "0 20px" }}>
          Diferencia = utilizado − requerido. Positiva (+): se usó más de lo
          requerido por la receta; negativa (-): se usó menos.
        </p>

        {errorComparacion && (
          <p className="ts-modal-error" role="alert" style={{ padding: "0 20px" }}>
            {errorComparacion}
          </p>
        )}

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Requerido por receta frente a utilizado por material y unidad</caption>
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col" className="ts-num">Requerido</th>
                <th scope="col" className="ts-num">Utilizado</th>
                <th scope="col" className="ts-num">Diferencia (utilizado − requerido)</th>
              </tr>
            </thead>
            <tbody>
              {filasComparacionMateriales(comparacion).map((f) => (
                <tr key={f.clave}>
                  <td>
                    {f.nombre} <span className="ts-code">({f.codigo})</span>
                    {f.fueraDeReceta && (
                      <>
                        <br />
                        <small>Fuera de la receta actual</small>
                      </>
                    )}
                  </td>
                  <td className="ts-num">{f.requerido}</td>
                  <td className="ts-num">{f.utilizado}</td>
                  <td className="ts-num">
                    <strong>{f.diferencia}</strong>
                  </td>
                </tr>
              ))}
              {comparacion.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    {errorComparacion
                      ? "Comparación no disponible."
                      : "La receta de esta orden no tiene materiales."}
                  </td>
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

      {/* ABC-82 y ABC-83: conformes y defectuosas se muestran por separado. */}
      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title">
          <h2>Calidad del producto terminado</h2>
          <span>
            {conformesCalidad.length} registros conformes ·{" "}
            {defectosCalidad.length} de defectos
          </span>
        </div>

        {errorCargaCalidad && (
          <p className="ts-modal-error" role="alert" style={{ padding: "0 20px" }}>
            {errorCargaCalidad}
          </p>
        )}

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Resumen de unidades producidas, conformes y defectuosas</caption>
            <thead>
              <tr>
                <th scope="col">Producidas</th>
                <th scope="col">Conformes</th>
                <th scope="col">Defectuosas</th>
                <th scope="col">Pendientes de clasificación</th>
              </tr>
            </thead>
            <tbody>
              {/* Sin los resultados de la API no se puede saber qué falta clasificar. */}
              <tr>
                <td>{formatearCantidad(calidad.producido, unidad)}</td>
                <td>{errorCargaCalidad ? "—" : formatearCantidad(calidad.conformes, unidad)}</td>
                <td>{errorCargaCalidad ? "—" : formatearCantidad(calidad.defectuosos, unidad)}</td>
                <td>
                  <strong>
                    {errorCargaCalidad ? "—" : formatearCantidad(calidad.porClasificar, unidad)}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {!errorCargaCalidad && (
          <p className="ts-field-help" role="note" style={{ padding: "0 20px" }}>
            {calidad.porClasificar > 0
              ? `${formatearCantidad(calidad.producido, unidad)} producidas − ${formatearCantidad(calidad.conformes, unidad)} conformes − ${formatearCantidad(calidad.defectuosos, unidad)} defectuosas = ${formatearCantidad(calidad.porClasificar, unidad)} pendientes de clasificación (aún no registradas como conformes ni como defectuosas).`
              : calidad.producido > 0
                ? "No hay unidades pendientes de clasificación: todo lo producido ya está registrado como conforme o defectuoso."
                : "La orden todavía no tiene unidades producidas que clasificar."}
          </p>
        )}

        <div className="ts-panel-title">
          <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 600 }}>
            Unidades conformes
          </h3>
          <span>
            Acumulado: {formatearCantidad(calidad.conformes, unidad)}
          </span>
        </div>

        {permiteCalidad ? (
          <form
            onSubmit={guardarConforme}
            noValidate
            style={{ padding: "12px 20px 16px" }}
          >
            <label
              htmlFor="cantidad-conforme"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: 320,
              }}
            >
              Cantidad conforme{unidad ? ` (en ${unidad})` : ""}
              <input
                id="cantidad-conforme"
                type="number"
                min="0.0001"
                max="9999999999.9999"
                step="0.0001"
                value={cantidadConforme}
                onChange={(e) => setCantidadConforme(e.target.value)}
                required
                disabled={guardandoConforme}
                style={{
                  minHeight: 36,
                  padding: "7px 10px",
                  border: "1px solid #e0e0e2",
                  borderRadius: 5,
                }}
              />
            </label>

            {errorConforme && (
              <p className="ts-modal-error" role="alert">
                {errorConforme}
              </p>
            )}

            {avisoConforme && (
              <p className="ts-success" role="status">
                {avisoConforme}
              </p>
            )}

            <div className="ts-btn-group" style={{ marginTop: 12 }}>
              <button
                type="submit"
                className="ts-btn ts-btn-primary"
                disabled={guardandoConforme}
              >
                {guardandoConforme ? "Registrando…" : "Registrar conformes"}
              </button>
            </div>
          </form>
        ) : (
          <p className="ts-empty">No tienes permiso para registrar conformes.</p>
        )}

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Historial de unidades conformes</caption>
            <thead>
              <tr>
                <th scope="col">Cantidad</th>
                <th scope="col">Responsable</th>
                <th scope="col">Fecha</th>
                <th scope="col">Hora</th>
              </tr>
            </thead>
            <tbody>
              {conformesCalidad.map((c, i) => {
                const { fecha, hora } = mostrarFechaHora(
                  c.fechaHora ?? c.fecha_hora,
                );

                return (
                  <tr key={c.id ?? i}>
                    <td>{formatearCantidad(c.cantidad, unidad)}</td>
                    <td>{responsableDeResultado(c, usuario)}</td>
                    <td>{fecha}</td>
                    <td>{hora}</td>
                  </tr>
                );
              })}
              {conformesCalidad.length === 0 && (
                <tr>
                  <td colSpan={4}>Todavía no hay unidades conformes registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ts-panel-title">
          <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 600 }}>
            Unidades defectuosas
          </h3>
          <span>
            Acumulado: {formatearCantidad(calidad.defectuosos, unidad)}
          </span>
        </div>

        {permiteCalidad ? (
          <form
            onSubmit={guardarDefecto}
            noValidate
            style={{ padding: "12px 20px 16px" }}
          >
            <label
              htmlFor="cantidad-defecto"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: 320,
                marginBottom: 12,
              }}
            >
              Cantidad defectuosa{unidad ? ` (en ${unidad})` : ""}
              <input
                id="cantidad-defecto"
                type="number"
                min="0.0001"
                max="9999999999.9999"
                step="0.0001"
                value={cantidadDefecto}
                onChange={(e) => setCantidadDefecto(e.target.value)}
                required
                disabled={guardandoDefecto}
                style={{
                  minHeight: 36,
                  padding: "7px 10px",
                  border: "1px solid #e0e0e2",
                  borderRadius: 5,
                }}
              />
            </label>

            <label
              htmlFor="causa-defecto"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: 520,
              }}
            >
              Causa del defecto *
              <input
                id="causa-defecto"
                type="text"
                maxLength={MAX_CAUSA_DEFECTO}
                placeholder="Ej.: rotura, sellado incompleto"
                value={causaDefecto}
                onChange={(e) => setCausaDefecto(e.target.value)}
                required
                disabled={guardandoDefecto}
                style={{
                  minHeight: 36,
                  padding: "7px 10px",
                  border: "1px solid #e0e0e2",
                  borderRadius: 5,
                }}
              />
            </label>

            {errorDefecto && (
              <p className="ts-modal-error" role="alert">
                {errorDefecto}
              </p>
            )}

            {avisoDefecto && (
              <p className="ts-success" role="status">
                {avisoDefecto}
              </p>
            )}

            <div className="ts-btn-group" style={{ marginTop: 12 }}>
              <button
                type="submit"
                className="ts-btn ts-btn-primary"
                disabled={guardandoDefecto}
              >
                {guardandoDefecto ? "Registrando…" : "Registrar defecto"}
              </button>
            </div>
          </form>
        ) : (
          <p className="ts-empty">No tienes permiso para registrar defectos.</p>
        )}

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Historial de unidades defectuosas y sus causas</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Causa</th>
                <th scope="col">Responsable</th>
                <th scope="col">Fecha</th>
                <th scope="col">Hora</th>
              </tr>
            </thead>
            <tbody>
              {defectosCalidad.map((d, i) => {
                const { fecha, hora } = mostrarFechaHora(
                  d.fechaHora ?? d.fecha_hora,
                );

                return (
                  <tr key={d.id ?? i}>
                    <td>{nombreProductoOrden(orden)}</td>
                    <td>{formatearCantidad(d.cantidad, unidad)}</td>
                    <td>{d.causaDefecto ?? d.causa_defecto ?? "—"}</td>
                    <td>{responsableDeResultado(d, usuario)}</td>
                    <td>{fecha}</td>
                    <td>{hora}</td>
                  </tr>
                );
              })}
              {defectosCalidad.length === 0 && (
                <tr>
                  <td colSpan={6}>Todavía no hay unidades defectuosas registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ABC-294: lotes que identifican unidades conformes de la orden. */}
      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title">
          <h2>Lotes de unidades conformes</h2>
          <span>{lotes.length} lotes</span>
        </div>

        {errorCargaLotes && (
          <p className="ts-modal-error" role="alert" style={{ padding: "0 20px" }}>
            {errorCargaLotes}
          </p>
        )}

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Conformes registrados, asignados a lotes y sin asignar</caption>
            <thead>
              <tr>
                <th scope="col">Conformes</th>
                <th scope="col">Asignadas a lotes</th>
                <th scope="col">Sin asignar</th>
              </tr>
            </thead>
            <tbody>
              {/* Sin conformes o lotes de la API no se calcula lo disponible. */}
              <tr>
                <td>{errorCargaCalidad ? "—" : formatearCantidad(calidad.conformes, unidad)}</td>
                <td>{errorCargaLotes ? "—" : formatearCantidad(resumenLotes.asignadas, unidad)}</td>
                <td>
                  <strong>
                    {errorCargaCalidad || errorCargaLotes
                      ? "—"
                      : formatearCantidad(resumenLotes.sinAsignar, unidad)}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {permiteCalidad ? (
          <form
            onSubmit={guardarLote}
            noValidate
            style={{ padding: "12px 20px 16px" }}
          >
            <label
              htmlFor="codigo-lote"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: 320,
                marginBottom: 12,
              }}
            >
              Código de lote *
              <input
                id="codigo-lote"
                type="text"
                maxLength={MAX_CODIGO_LOTE}
                placeholder="Ej.: L-7"
                value={codigoLote}
                onChange={(e) => setCodigoLote(e.target.value)}
                required
                disabled={guardandoLote}
                style={{
                  minHeight: 36,
                  padding: "7px 10px",
                  border: "1px solid #e0e0e2",
                  borderRadius: 5,
                }}
              />
            </label>

            <label
              htmlFor="cantidad-lote"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                maxWidth: 320,
              }}
            >
              Cantidad conforme del lote{unidad ? ` (en ${unidad})` : ""}
              <input
                id="cantidad-lote"
                type="number"
                min="0.0001"
                max="9999999999.9999"
                step="0.0001"
                value={cantidadLote}
                onChange={(e) => setCantidadLote(e.target.value)}
                required
                disabled={guardandoLote}
                style={{
                  minHeight: 36,
                  padding: "7px 10px",
                  border: "1px solid #e0e0e2",
                  borderRadius: 5,
                }}
              />
            </label>

            {errorLote && (
              <p className="ts-modal-error" role="alert">
                {errorLote}
              </p>
            )}

            {avisoLote && (
              <p className="ts-success" role="status">
                {avisoLote}
              </p>
            )}

            <div className="ts-btn-group" style={{ marginTop: 12 }}>
              <button
                type="submit"
                className="ts-btn ts-btn-primary"
                disabled={guardandoLote}
              >
                {guardandoLote ? "Creando…" : "Crear lote"}
              </button>
            </div>
          </form>
        ) : (
          <p className="ts-empty">No tienes permiso para crear lotes.</p>
        )}

        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Lotes de la orden</caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Responsable</th>
                <th scope="col">Fecha</th>
                <th scope="col">Hora</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => {
                const { fecha, hora } = mostrarFechaHora(l.fechaHora ?? l.fecha_hora);

                return (
                  <tr key={l.id ?? l.codigo}>
                    <td className="ts-code">{l.codigo}</td>
                    <td>{formatearCantidad(l.cantidad, unidad)}</td>
                    <td>{responsableDeResultado(l, usuario)}</td>
                    <td>{fecha}</td>
                    <td>{hora}</td>
                  </tr>
                );
              })}
              {lotes.length === 0 && (
                <tr>
                  <td colSpan={5}>Esta orden todavía no tiene lotes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ABC-299: resumen de cierre tal como lo guardó la API, sin recalcular. */}
      <div className="ts-panel" style={{ marginBottom: 16 }}>
        <div className="ts-panel-title">
          <h2>Resumen de cierre</h2>
          <span
            className={`ts-badge ${
              estadoCierre === "preparado"
                ? "ts-badge--FINALIZADA"
                : estadoCierre === "sin-preparar" && orden.estado === "FINALIZADA"
                  ? "ts-badge--PENDIENTE"
                  : "ts-badge--inactivo"
            }`}
          >
            {estadoCierre === "preparado"
              ? "Preparado"
              : estadoCierre === "cargando"
                ? "Cargando…"
                : estadoCierre === "sin-preparar" && orden.estado === "FINALIZADA"
                  ? "Pendiente de preparar"
                  : "No disponible"}
          </span>
        </div>

        <p className="ts-field-help" role="note" style={{ padding: "0 20px" }}>
          Estado del reporte:{" "}
          <strong>
            {estadoCierre === "preparado"
              ? (() => {
                  const { fecha, hora } = mostrarFechaHora(cierre.fechaCierre);
                  return `preparado, versión ${cierre.cierreVersion}, el ${fecha} a las ${hora}.`;
                })()
              : estadoCierre === "error"
                ? "no se pudo consultar."
                : orden.estado === "FINALIZADA"
                  ? `versión ${VERSION_CIERRE_INICIAL} pendiente de preparar.`
                  : `no disponible: la orden debe estar FINALIZADA (actual: ${mostrarEstadoOrden(orden.estado).toLowerCase()}).`}
          </strong>{" "}
          Es una copia fija de los registros al cerrar; no incluye costos, asientos ni impuestos.
        </p>

        {errorCargaCierre && (
          <p className="ts-modal-error" role="alert" style={{ padding: "0 20px" }}>
            {errorCargaCierre}
          </p>
        )}

        {estadoCierre === "preparado" && cierre ? (
          <>
            {/* Se lee junto con el cierre al abrir la orden, sin esperar a la operación de preparar. */}
            <div
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "4px 20px 8px" }}
            >
              <span>Reporte a Contabilidad:</span>
              <span
                className={`ts-badge ${
                  reporteContable?.estado === "RECIBIDO"
                    ? "ts-badge--FINALIZADA"
                    : reporteContable?.estado === "RECHAZADO"
                      ? "ts-badge--CANCELADA"
                      : reporteContable?.estado === "ENVIADO"
                        ? "ts-badge--PENDIENTE"
                        : "ts-badge--inactivo"
                }`}
              >
                {reporteContable
                  ? ESTADOS_REPORTE_CONTABLE[reporteContable.estado]
                  : "Sin estado informado"}
              </span>
              {reporteContable?.actualizadoEn && (
                <small>
                  {(() => {
                    const { fecha, hora } = mostrarFechaHora(reporteContable.actualizadoEn);
                    return `${fecha} ${hora}`;
                  })()}
                </small>
              )}
              <button
                type="button"
                className="ts-btn ts-btn--sm"
                onClick={actualizarReporteContable}
                disabled={actualizandoReporte}
              >
                {actualizandoReporte ? "Actualizando…" : "Actualizar estado"}
              </button>
            </div>

            {reporteContable?.estado === "RECHAZADO" && (
              <p className="ts-modal-error" role="alert" style={{ padding: "0 20px" }}>
                Contabilidad rechazó el reporte
                {reporteContable.codigoRechazo ? ` (${reporteContable.codigoRechazo})` : ""}
                {reporteContable.detalle ? `: ${reporteContable.detalle}` : "."}
              </p>
            )}

            <p className="ts-field-help" style={{ padding: "0 20px" }}>
              Enviado: publicado y esperando respuesta. Recibido: Contabilidad recibió el
              resumen; no significa aprobación contable.
            </p>

            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Datos congelados del cierre</caption>
                <tbody>
                  <tr>
                    <th scope="row">Orden</th>
                    <td className="ts-code">{cierre.ordenCodigo}</td>
                  </tr>
                  <tr>
                    <th scope="row">Producto</th>
                    <td>
                      {cierre.producto?.nombre ?? "—"}{" "}
                      <span className="ts-code">({cierre.producto?.codigo ?? "—"})</span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Finalizada</th>
                    <td>
                      {(() => {
                        const { fecha, hora } = mostrarFechaHora(cierre.finalizadaAt);
                        return `${fecha} ${hora}`;
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Versión</th>
                    <td>{cierre.cierreVersion}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Cantidades del cierre</caption>
                <thead>
                  <tr>
                    <th scope="col" className="ts-num">Solicitada</th>
                    <th scope="col" className="ts-num">Producida</th>
                    <th scope="col" className="ts-num">Conforme</th>
                    <th scope="col" className="ts-num">Defectuosa</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="ts-num">{formatearCantidad(cierre.cantidadSolicitada, cierre.producto?.unidad)}</td>
                    <td className="ts-num">{formatearCantidad(cierre.cantidadProducida, cierre.producto?.unidad)}</td>
                    <td className="ts-num">{formatearCantidad(cierre.cantidadConforme, cierre.producto?.unidad)}</td>
                    <td className="ts-num">{formatearCantidad(cierre.cantidadDefectuosa, cierre.producto?.unidad)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Consumo por material al cierre</caption>
                <thead>
                  <tr>
                    <th scope="col">Material</th>
                    <th scope="col" className="ts-num">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(cierre.consumos) ? cierre.consumos : []).map((c) => (
                    <tr key={`${c.materialId}-${c.unidad}`}>
                      <td>
                        {c.materialNombre} <span className="ts-code">({c.materialCodigo})</span>
                      </td>
                      <td className="ts-num">{formatearCantidad(c.cantidad, c.unidad)}</td>
                    </tr>
                  ))}
                  {!(Array.isArray(cierre.consumos) && cierre.consumos.length > 0) && (
                    <tr>
                      <td colSpan={2}>No había consumos registrados al cerrar.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : estadoCierre === "sin-preparar" && (
          <div style={{ padding: "12px 20px 16px" }}>
            {permiteCierre ? (
              <div className="ts-btn-group">
                <button
                  type="button"
                  className="ts-btn ts-btn-primary"
                  onClick={prepararResumenCierre}
                  disabled={preparandoCierre || orden.estado !== "FINALIZADA"}
                  title={
                    orden.estado !== "FINALIZADA"
                      ? "La orden debe estar FINALIZADA para preparar su resumen."
                      : undefined
                  }
                >
                  {preparandoCierre
                    ? "Preparando…"
                    : `Preparar resumen de cierre (versión ${VERSION_CIERRE_INICIAL})`}
                </button>
              </div>
            ) : (
              <p className="ts-empty" style={{ padding: 0 }}>
                Solo quien puede finalizar órdenes prepara el resumen de cierre.
              </p>
            )}
          </div>
        )}

        {errorCierre && (
          <p className="ts-modal-error" role="alert" style={{ padding: "0 20px 12px" }}>
            {errorCierre}
          </p>
        )}

        {avisoCierre && (
          <p className="ts-success" role="status" style={{ margin: "0 20px 16px" }}>
            {avisoCierre}
          </p>
        )}
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
