import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { obtenerOrdenes, obtenerTotalProducido } from "../services/ordenesService.js";
import { puedeCrear } from "../utils/ordenes.js";
import {
  cantidadSolicitadaOrden,
  fechaProgramadaOrden,
  mostrarCantidad,
  mostrarFecha,
  nombreProductoOrden,
  responsableOrden,
  totalProducidoDe,
} from "../utils/formato.js";
import { formatearCantidad, formatearFecha } from "../utils/format.js";
import { BadgeEstadoOrden, BarraAvance } from "../components/ui/Badges.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import CrearOrdenModal from "../components/ordenes/CrearOrdenModal.jsx";
import Paginacion, { paginar, totalPaginas } from "../components/ui/Paginacion.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// Pantalla unificada "Órdenes" (ruta /ordenes).
// Fusiona OrdenPage (creación), ConsultaOrdenesPage (filtros + estados)
// y OrdenesPage (avances): el listado muestra el avance y el detalle
// concentra las acciones (planificar / iniciar / avance / finalizar / cancelar).
export default function OrdenesPage() {
  const { usuario } = useSesion();
  const navigate = useNavigate();
  const [ordenes, setOrdenes] = useState([]);
  const [totales, setTotales] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [producto, setProducto] = useState("");
  const [estado, setEstado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [aviso, setAviso] = useState("");
  const permiteCrear = puedeCrear(usuario);

  useEffect(() => { document.title = FORMATO_TITULO("Órdenes"); }, []);

  async function cargarOrdenes() {
    setCargando(true);
    setError("");
    try {
      const datos = await obtenerOrdenes();
      const lista = Array.isArray(datos) ? datos : [];
      setOrdenes(lista);
      setPagina(1);
      // Totales de avance (progreso producido vs solicitado). Se cargan en
      // segundo plano y no bloquean el listado si fallan.
      const relevantes = lista.filter((o) => ["EN_PRODUCCION", "FINALIZADA"].includes(o.estado));
      if (relevantes.length > 0) {
        const resultados = await Promise.allSettled(
          relevantes.map(async (o) => ({ id: o.id, total: totalProducidoDe(await obtenerTotalProducido(o.id)) })),
        );
        setTotales((previo) => {
          const siguiente = { ...previo };
          for (const r of resultados) {
            if (r.status === "fulfilled") siguiente[r.value.id] = r.value.total;
          }
          return siguiente;
        });
      }
    } catch (fallo) {
      setError(fallo.message || "No se pudieron cargar las órdenes. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (cancelado) return;
      await cargarOrdenes();
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  const ordenesVisibles = useMemo(() => ordenes.filter((orden) => {
    const fecha = mostrarFecha(fechaProgramadaOrden(orden));
    return (
      nombreProductoOrden(orden).toLocaleLowerCase("es-BO").includes(producto.toLocaleLowerCase("es-BO")) &&
      (!estado || orden.estado === estado) &&
      (!desde || fecha >= desde) &&
      (!hasta || fecha <= hasta)
    );
  }), [ordenes, producto, estado, desde, hasta]);
  const paginasOrdenes = totalPaginas(ordenesVisibles);
  const ordenesPaginadas = paginar(ordenesVisibles, pagina);

  function cambiarFiltro(fijar) {
    return (evento) => { fijar(evento.target.value); setPagina(1); };
  }

  function unidadDe(orden) {
    return orden?.unidad_producto ?? orden?.unidad_medida ?? "";
  }

  function abrirDetalle(id) {
    if (id != null) navigate(`/ordenes/${id}`);
  }

  function manejarTeclaDetalle(evento, id) {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      abrirDetalle(id);
    }
  }

  return (
    <section className="ts-page" aria-labelledby="ordenes-title">
      <PageHeader
        titulo="Órdenes"
        conteo={!cargando && !error ? `${ordenes.length} órdenes` : null}
        accion={permiteCrear ? (
          <button type="button" className="ts-btn ts-btn-primary" onClick={() => setMostrarCrear(true)}>
            Nueva orden
          </button>
        ) : null}
      />

      {aviso && <p className="ts-success" role="status">{aviso}</p>}

      {cargando && <p className="ts-feedback" role="status">Cargando órdenes…</p>}
      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button>
        </div>
      )}
      {!cargando && !error && ordenes.length === 0 && (
        <p className="ts-feedback">Sin órdenes.</p>
      )}
      {!cargando && !error && ordenes.length > 0 && (
        <div className="ts-panel">
          <div className="ts-panel-title"><h2 id="ordenes-title">Listado</h2><span>{ordenesVisibles.length} resultados</span></div>
          <div className="ts-filters">
            <label htmlFor="filtro-producto">Producto
              <input id="filtro-producto" type="search" value={producto} onChange={cambiarFiltro(setProducto)} placeholder="Buscar producto" />
            </label>
            <label htmlFor="filtro-estado">Estado
              <select id="filtro-estado" value={estado} onChange={cambiarFiltro(setEstado)}>
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PLANIFICADA">Planificada</option>
                <option value="EN_PRODUCCION">En producción</option>
                <option value="FINALIZADA">Finalizada</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </label>
            <label htmlFor="filtro-desde">Desde
              <input id="filtro-desde" type="date" value={desde} max={hasta || undefined} onChange={cambiarFiltro(setDesde)} />
            </label>
            <label htmlFor="filtro-hasta">Hasta
              <input id="filtro-hasta" type="date" value={hasta} min={desde || undefined} onChange={cambiarFiltro(setHasta)} />
            </label>
            <button type="button" className="ts-btn ts-btn-quiet" onClick={() => { setProducto(""); setEstado(""); setDesde(""); setHasta(""); setPagina(1); }}>Limpiar filtros</button>
          </div>
          {ordenesVisibles.length === 0 ? (
            <p className="ts-empty">Sin resultados.</p>
          ) : (
            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Listado de órdenes de producción</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Fecha programada</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Responsable</th>
                    <th scope="col">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenesPaginadas.map((orden) => {
                    const solicitada = cantidadSolicitadaOrden(orden);
                    const acumulado = totales[orden.id] ?? 0;
                    return (
                      <tr
                        key={orden.id ?? orden.codigo}
                        className="ts-row-clickable"
                        tabIndex={0}
                        onClick={() => abrirDetalle(orden.id)}
                        onKeyDown={(e) => manejarTeclaDetalle(e, orden.id)}
                        aria-label={`Ver detalle de la orden ${orden.codigo}`}
                      >
                        <td className="ts-code">{orden.codigo ?? "—"}</td>
                        <td>{nombreProductoOrden(orden)}</td>
                        <td>{formatearCantidad(solicitada, unidadDe(orden))}</td>
                        <td>{formatearFecha(fechaProgramadaOrden(orden))}</td>
                        <td><BadgeEstadoOrden estado={orden.estado} /></td>
                        <td>{responsableOrden(orden)}</td>
                        <td>
                          {["EN_PRODUCCION", "FINALIZADA"].includes(orden.estado) ? (
                            <BarraAvance acumulado={acumulado} solicitada={Number(solicitada) || 0} />
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
          <Paginacion pagina={pagina} total={paginasOrdenes} alCambiar={setPagina} etiqueta="Paginación de órdenes" />
        </div>
      )}

      <CrearOrdenModal
        abierto={mostrarCrear}
        alCerrar={() => setMostrarCrear(false)}
        alCrear={(creada) => {
          setAviso(`Orden ${creada.codigo ?? creada.id} creada.`);
          setMostrarCrear(false);
          if (creada?.id) navigate(`/ordenes/${creada.id}`, { state: { exito: `Orden ${creada.codigo ?? creada.id} creada.` } });
          else setIntento((actual) => actual + 1);
        }}
      />
    </section>
  );
}
