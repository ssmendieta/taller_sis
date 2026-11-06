import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { obtenerRuta, PERMISO_CONSULTAR_RUTAS } from "../services/historialLogisticoService.js";
import { PERMISO_CONSULTAR_BOLETAS } from "../services/boletasService.js";
import { despacharRuta, PERMISO_GESTIONAR_RUTAS, registrarEntrega } from "../services/logisticaService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { BadgeEstadoRuta } from "../components/logistica/historial/TablaHistorialRutas.jsx";
import FormularioObservacion from "../components/logistica/despacho/FormularioObservacion.jsx";
import EstadoEntregaParada, { fechaHora } from "../components/logistica/despacho/EstadoEntregaParada.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";
import "../styles/despacho-ruta.css";

function mensajeError(fallo) {
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  if (fallo?.status === 403) return `No tienes permiso para despachar ni registrar entregas. Permiso necesario: ${PERMISO_GESTIONAR_RUTAS}.`;
  return fallo?.message || "No se pudo completar la operación.";
}

function resumenEntregas(paradas) {
  const cuenta = (estado) => paradas.filter((parada) => parada.estadoEntrega === estado).length;
  const anuladas = cuenta("ANULADA");
  const validas = paradas.length - anuladas;
  return `${cuenta("ENTREGADA")} de ${validas} ${validas === 1 ? "entrega" : "entregas"} registradas${anuladas ? ` · ${anuladas} anulada${anuladas === 1 ? "" : "s"}` : ""}`;
}

// Detalle de una ruta abierta desde el historial (ABC-392). ABC-377 agrega el
// despacho y la entrega individual de cada parada con la API de ABC-376.
export default function RutaDetallePage() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const puedeVerBoletas = tienePermiso(usuario, PERMISO_CONSULTAR_BOLETAS);
  const puedeGestionar = tienePermiso(usuario, PERMISO_GESTIONAR_RUTAS);
  const [ruta, setRuta] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [paradaAbierta, setParadaAbierta] = useState(null);

  useEffect(() => {
    let vigente = true;
    document.title = FORMATO_TITULO(`Ruta #${id}`);
    setRuta(null);
    setError("");
    obtenerRuta(id)
      .then((datos) => { if (vigente) setRuta(datos); })
      .catch((fallo) => { if (vigente) setError(fallo.status === 404 ? "La ruta no existe." : fallo.message); });
    return () => { vigente = false; };
  }, [id]);

  // Tras un 409 (otro usuario ya cambió la ruta) se muestra el estado real.
  async function recargar() {
    try { setRuta(await obtenerRuta(id)); } catch { /* Se conserva la vista anterior. */ }
  }

  async function ejecutar(accion, exito, contexto = "") {
    setAviso("");
    setErrorAccion("");
    try {
      const actualizada = await accion();
      setRuta(actualizada);
      setParadaAbierta(null);
      setAviso(exito(actualizada));
    } catch (fallo) {
      setErrorAccion(`${contexto}${mensajeError(fallo)}`);
      if (fallo?.status === 409 || fallo?.status === 404) await recargar();
    }
  }

  function despachar(observacion) {
    return ejecutar(
      () => despacharRuta(ruta.id, observacion),
      () => "Ruta despachada: está en tránsito y sus entregas se registran por parada.",
      "No se despachó la ruta: ",
    );
  }

  function entregar(parada, observacion) {
    return ejecutar(
      () => registrarEntrega(ruta.id, parada.id, observacion),
      (actualizada) => actualizada.estado === "COMPLETADA"
        ? `Entrega de la parada ${parada.secuencia} registrada. Todas las entregas válidas están hechas: la ruta quedó completada.`
        : `Entrega de la parada ${parada.secuencia} registrada. La ruta sigue en tránsito.`,
      `Parada ${parada.secuencia}: `,
    );
  }

  if (!tienePermiso(usuario, PERMISO_CONSULTAR_RUTAS)) {
    return <p className="ts-feedback ts-error" role="alert">No tienes permiso para consultar rutas.</p>;
  }

  const volver = <Link className="ts-btn" to="/logistica/rutas/historial">Volver al historial</Link>;
  if (error) {
    return (
      <section className="ts-page">
        <PageHeader titulo={`Ruta #${id}`} accion={volver} />
        <p className="ts-modal-error" role="alert">{error}</p>
      </section>
    );
  }
  if (!ruta) return <p className="ts-empty">Cargando ruta…</p>;

  const paradas = [...(ruta.paradas ?? [])].sort((a, b) => a.secuencia - b.secuencia);
  const enTransito = ruta.estado === "DESPACHADA";
  const puedeEntregar = puedeGestionar && enTransito;
  return (
    <section className="ts-page despacho-ruta" aria-labelledby="ruta-detalle-titulo">
      <PageHeader
        titulo={`Ruta #${ruta.id}`}
        descripcion={puedeGestionar ? "Despacho y entregas de la ruta." : "Detalle de solo lectura."}
        accion={volver}
      />

      {aviso && <p className="ts-success" role="status">{aviso}</p>}
      {errorAccion && <p className="ts-feedback ts-error" role="alert">{errorAccion}</p>}

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="ruta-detalle-titulo">Datos generales</h2>
          <BadgeEstadoRuta estado={ruta.estado} />
        </div>
        <dl className="despacho-datos">
          <dt>Fecha programada</dt><dd>{ruta.fechaProgramada}</dd>
          <dt>Vehículo</dt><dd>{ruta.vehiculoExternoId}</dd>
          <dt>Chofer</dt><dd>{ruta.choferExternoId}</dd>
          <dt>Despacho</dt>
          <dd>{ruta.despachadaEn
            ? `${fechaHora(ruta.despachadaEn)} · usuario #${ruta.despachadaPorUsuarioId}${enTransito ? " · en tránsito" : ""}`
            : "Sin despachar"}</dd>
          {ruta.despachoObservacion && <><dt>Observación del despacho</dt><dd>{ruta.despachoObservacion}</dd></>}
          {ruta.completadaEn && <><dt>Completada</dt><dd>{fechaHora(ruta.completadaEn)}</dd></>}
        </dl>
      </div>

      {puedeGestionar && ruta.estado === "PLANIFICADA" && (
        <div className="ts-panel despacho-panel">
          <div className="ts-panel-title"><h2>Despachar ruta</h2></div>
          <FormularioObservacion
            id="despacho-observacion"
            etiqueta="Observación del despacho"
            accion="Despachar ruta"
            accionEnCurso="Despachando…"
            ayuda="Al despachar, la ruta pasa a tránsito y ya no se puede editar. Todas sus boletas deben seguir emitidas."
            onEnviar={despachar}
          />
        </div>
      )}

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2>Paradas y entregas</h2>
          <span>{paradas.length} paradas · {resumenEntregas(paradas)}</span>
        </div>
        {paradas.length === 0 ? (
          <p className="ts-empty">La ruta no tiene paradas registradas.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Paradas de la ruta en orden de visita</caption>
              <thead>
                <tr>
                  <th scope="col">N.º</th>
                  <th scope="col">Destino</th>
                  <th scope="col">Boletas</th>
                  <th scope="col">Entrega</th>
                  {puedeEntregar && <th scope="col">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {paradas.map((parada) => {
                  const pendiente = parada.estadoEntrega === "PENDIENTE";
                  return (
                    <Fragment key={parada.id}>
                      <tr>
                        <td>{parada.secuencia}</td>
                        <td>{parada.destino}</td>
                        <td>
                          {(parada.boletas ?? []).map((documento, indice) => (
                            <span key={documento.id}>
                              {indice > 0 && ", "}
                              {puedeVerBoletas
                                ? <Link to={`/logistica/boletas/${documento.boletaId}`}>Boleta {documento.boletaId}</Link>
                                : `Boleta ${documento.boletaId}`}
                            </span>
                          ))}
                        </td>
                        <td><EstadoEntregaParada parada={parada} /></td>
                        {puedeEntregar && (
                          <td>
                            {pendiente && paradaAbierta !== parada.id && (
                              <button type="button" className="ts-btn ts-btn--sm"
                                aria-label={`Registrar entrega de la parada ${parada.secuencia}`}
                                onClick={() => { setParadaAbierta(parada.id); setErrorAccion(""); }}>
                                Registrar entrega
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {puedeEntregar && pendiente && paradaAbierta === parada.id && (
                        <tr className="despacho-fila-formulario">
                          <td colSpan={5}>
                            <FormularioObservacion
                              id={`entrega-observacion-${parada.id}`}
                              etiqueta={`Observación de la entrega en la parada ${parada.secuencia}`}
                              accion="Confirmar entrega"
                              accionEnCurso="Registrando…"
                              ayuda="Se registran todas las boletas de la parada."
                              onEnviar={(observacion) => entregar(parada, observacion)}
                              onCancelar={() => setParadaAbierta(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Separado del tránsito y la entrega: el resultado de Inventarios llegará con ABC-384. */}
      <div className="ts-panel despacho-inventarios" aria-labelledby="ruta-inventarios-titulo">
        <div className="ts-panel-title">
          <h2 id="ruta-inventarios-titulo">Notificación a Inventarios</h2>
          <span className="ts-badge ts-badge--inactivo">Sin integrar</span>
        </div>
        <p className="ts-field-help">
          El estado de tránsito y de entrega es de Logística. Que Inventarios reciba el aviso de salida es un
          resultado aparte, que se mostrará aquí cuando esté integrado: despachar o entregar no confirma
          movimientos de inventario.
        </p>
      </div>
    </section>
  );
}
