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
import { BadgeEstadoOrden, BarraAvance } from "../components/ui/Badges.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import CrearOrdenModal from "../components/ordenes/CrearOrdenModal.jsx";

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
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [aviso, setAviso] = useState("");
  const permiteCrear = puedeCrear(usuario);

  async function cargarOrdenes() {
    setCargando(true);
    setError("");
    try {
      const datos = await obtenerOrdenes();
      const lista = Array.isArray(datos) ? datos : [];
      setOrdenes(lista);
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

  const resumen = useMemo(() => ({
    total: ordenes.length,
    enProduccion: ordenes.filter((o) => o.estado === "EN_PRODUCCION").length,
    pendientes: ordenes.filter((o) => o.estado === "PENDIENTE").length,
    finalizadas: ordenes.filter((o) => o.estado === "FINALIZADA").length,
  }), [ordenes]);

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
        descripcion="Consulta las órdenes, su avance y el responsable. Selecciona una fila para ver el detalle."
        conteo={!cargando && !error ? `${ordenes.length} órdenes registradas` : null}
        accion={permiteCrear ? (
          <button type="button" className="ts-btn ts-btn-primary" onClick={() => setMostrarCrear(true)}>
            + Nueva orden
          </button>
        ) : null}
      />

      {aviso && <p className="ts-success" role="status">{aviso}</p>}

      {!cargando && !error && (
        <div className="ts-panel" aria-label="Resumen de órdenes" style={{ marginBottom: 16 }}>
          <div className="ts-panel-title"><h2>Resumen</h2></div>
          <div className="ts-filters" style={{ paddingTop: 4 }}>
            <span>Total de órdenes: <strong>{resumen.total}</strong></span>
            <span>En producción: <strong>{resumen.enProduccion}</strong></span>
            <span>Pendientes: <strong>{resumen.pendientes}</strong></span>
            <span>Finalizadas: <strong>{resumen.finalizadas}</strong></span>
          </div>
        </div>
      )}

      {cargando && <p className="ts-feedback" role="status">Cargando órdenes…</p>}
      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button>
        </div>
      )}
      {!cargando && !error && ordenes.length === 0 && (
        <p className="ts-feedback">Todavía no hay órdenes registradas.</p>
      )}
      {!cargando && !error && ordenes.length > 0 && (
        <div className="ts-panel">
          <div className="ts-panel-title"><h2 id="ordenes-title">Listado de órdenes</h2><span>{ordenesVisibles.length} resultados</span></div>
          <div className="ts-filters">
            <label htmlFor="filtro-producto">Producto
              <input id="filtro-producto" type="search" value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Buscar producto" />
            </label>
            <label htmlFor="filtro-estado">Estado
              <select id="filtro-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PLANIFICADA">Planificada</option>
                <option value="EN_PRODUCCION">En producción</option>
                <option value="FINALIZADA">Finalizada</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </label>
            <label htmlFor="filtro-desde">Desde
              <input id="filtro-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label htmlFor="filtro-hasta">Hasta
              <input id="filtro-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
            </label>
            <button type="button" className="ts-btn" onClick={() => { setProducto(""); setEstado(""); setDesde(""); setHasta(""); }}>Limpiar</button>
          </div>
          {ordenesVisibles.length === 0 ? (
            <p className="ts-empty">No hay órdenes que coincidan con estos filtros.</p>
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
                  {ordenesVisibles.map((orden) => {
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
                        <td>{mostrarCantidad(solicitada)}</td>
                        <td>{mostrarFecha(fechaProgramadaOrden(orden))}</td>
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
        </div>
      )}

      <CrearOrdenModal
        abierto={mostrarCrear}
        alCerrar={() => setMostrarCrear(false)}
        alCrear={(creada) => {
          setAviso(`Orden ${creada.codigo ?? creada.id} registrada correctamente.`);
          setIntento((actual) => actual + 1);
        }}
      />
    </section>
  );
}
