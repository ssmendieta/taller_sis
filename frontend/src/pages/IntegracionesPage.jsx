import { useEffect, useState } from "react";
import {
  ESTADOS_OUTBOX,
  LIMITE_EVENTOS,
  listarEventos,
  reintentarEvento,
} from "../services/integracionesService.js";
import { formatearFechaHora } from "../utils/format.js";
import Paginacion from "../components/ui/Paginacion.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// Estado del transporte en el outbox; nunca confirma el procesamiento del receptor.
const ETIQUETAS_ESTADO = {
  PENDIENTE: { texto: "Pendiente", clase: "ts-badge--PENDIENTE" },
  PROCESANDO: { texto: "Procesando", clase: "ts-badge--EN_PRODUCCION" },
  PUBLICADO: { texto: "Publicado en Pub/Sub", clase: "ts-badge--FINALIZADA" },
};

const MAX_ERROR_RESUMIDO = 120;

function resumirError(texto) {
  if (!texto) return "—";
  return texto.length > MAX_ERROR_RESUMIDO
    ? `${texto.slice(0, MAX_ERROR_RESUMIDO)}…`
    : texto;
}

function fechaHoraTexto(valor) {
  if (!valor) return "—";
  const { fecha, hora } = formatearFechaHora(valor);
  return `${fecha} ${hora}`;
}

function motivoSinReintento(evento) {
  if (evento.estado === "PUBLICADO") return "El evento ya fue publicado en Pub/Sub.";
  if (evento.estado === "PROCESANDO") return "El publicador lo está procesando.";
  return undefined;
}

function mensajeError(fallo, respaldo) {
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  if (fallo?.status === 403) return "No tienes permiso para administrar las publicaciones de integración.";
  return fallo?.message || respaldo;
}

export default function IntegracionesPage() {
  const [estado, setEstado] = useState("");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ items: [], total: 0, limit: LIMITE_EVENTOS });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [reintentando, setReintentando] = useState(null);

  // `silencioso` refresca sin vaciar la tabla (tras un reintento).
  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) setCargando(true);
    setError("");

    try {
      const respuesta = await listarEventos({ estado, page: pagina });
      setDatos({
        items: Array.isArray(respuesta?.items) ? respuesta.items : [],
        total: Number(respuesta?.total) || 0,
        limit: Number(respuesta?.limit) || LIMITE_EVENTOS,
      });
    } catch (fallo) {
      setDatos({ items: [], total: 0, limit: LIMITE_EVENTOS });
      setError(mensajeError(fallo, "No se pudieron cargar los mensajes de integración."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, pagina]);

  useEffect(() => {
    document.title = FORMATO_TITULO("Integraciones");
  }, []);

  async function reintentar(evento) {
    if (reintentando) return;

    setReintentando(evento.id);
    setAviso("");
    setErrorAccion("");

    try {
      const respuesta = await reintentarEvento(evento.id);
      setAviso(
        `${respuesta?.mensaje ?? "Reintento programado"} para el evento ${evento.eventId}. Saldrá cuando el publicador lo procese; esto no confirma que el receptor lo haya recibido.`,
      );
    } catch (fallo) {
      // Un 409 no es éxito: se informa y el listado se refresca con el estado real.
      setErrorAccion(mensajeError(fallo, "No se pudo programar el reintento."));
    } finally {
      await cargar({ silencioso: true });
      setReintentando(null);
    }
  }

  const { items, total, limit } = datos;
  const paginas = Math.max(1, Math.ceil(total / limit));
  const publicadorDeshabilitado = items.some((e) => e.publicadorHabilitado === false);

  return (
    <section className="ts-page" aria-labelledby="integraciones-titulo">
      <PageHeader
        titulo="Mensajes de integración"
        descripcion="Eventos del outbox hacia Inventarios y Contabilidad. «Publicado» significa que Pub/Sub aceptó el mensaje, no que el receptor terminó la operación."
        conteo={!cargando && !error ? `${total} ${total === 1 ? "evento" : "eventos"}` : null}
      />

      {aviso && <p className="ts-success" role="status">{aviso}</p>}
      {errorAccion && <p className="ts-notice ts-error" role="alert">{errorAccion}</p>}

      {publicadorDeshabilitado && (
        <p className="ts-notice" role="note">
          El publicador está deshabilitado: los eventos quedan pendientes y saldrán
          cuando se habilite. Reintentar solo adelanta el próximo intento.
        </p>
      )}

      <div className="ts-panel">
        <div className="ts-filters">
          <label>
            Estado
            <select
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Todos</option>
              {ESTADOS_OUTBOX.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETAS_ESTADO[valor].texto}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ts-btn"
            onClick={() => cargar()}
            disabled={cargando}
          >
            Actualizar
          </button>
        </div>

        {cargando ? (
          <p className="ts-feedback" role="status">Cargando mensajes…</p>
        ) : error ? (
          <div className="ts-feedback ts-error" role="alert">
            <p>{error}</p>
            <button type="button" className="ts-btn" onClick={() => cargar()}>
              Reintentar carga
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="ts-empty">
            {estado
              ? `No hay eventos en estado ${ETIQUETAS_ESTADO[estado].texto.toLowerCase()}.`
              : "No hay eventos en el outbox."}
          </p>
        ) : (
          <>
            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Eventos del outbox con su estado de publicación</caption>
                <thead>
                  <tr>
                    <th scope="col">eventId</th>
                    <th scope="col">correlationId</th>
                    <th scope="col">Destino</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="ts-num">Intentos</th>
                    <th scope="col">Último error</th>
                    <th scope="col">Próximo intento / publicado</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((evento) => {
                    const etiqueta = ETIQUETAS_ESTADO[evento.estado];
                    const motivo = motivoSinReintento(evento);

                    return (
                      <tr key={evento.id}>
                        <td>
                          <span className="ts-code">{evento.eventId}</span>
                          <br />
                          <small>{evento.eventType}</small>
                        </td>
                        <td className="ts-code">{evento.correlationId ?? "—"}</td>
                        <td>{evento.destinoConfigurado ?? "Sin topic configurado"}</td>
                        <td>
                          <span className={`ts-badge ${etiqueta?.clase ?? ""}`}>
                            {etiqueta?.texto ?? evento.estado}
                          </span>
                        </td>
                        <td className="ts-num">{evento.intentos}</td>
                        <td title={evento.ultimoError ?? undefined}>
                          {resumirError(evento.ultimoError)}
                        </td>
                        <td>
                          {evento.estado === "PUBLICADO"
                            ? fechaHoraTexto(evento.publicadoEn)
                            : fechaHoraTexto(evento.proximoIntentoEn)}
                        </td>
                        <td>
                          <div className="ts-row-actions">
                            <button
                              type="button"
                              className="ts-btn ts-btn--sm"
                              disabled={!evento.puedeReintentar || reintentando !== null}
                              title={motivo}
                              onClick={() => reintentar(evento)}
                            >
                              {reintentando === evento.id ? "Programando…" : "Reintentar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Paginacion
              pagina={pagina}
              total={paginas}
              alCambiar={setPagina}
              etiqueta="Paginación de mensajes de integración"
            />
          </>
        )}
      </div>
    </section>
  );
}
