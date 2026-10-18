<<<<<<< HEAD
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";

const solicitudesDemo = [
  {
    id: "SOL-0001",
    orden: "ORD-2026-00001",
    cantidad: 10,
    unidad: "cajas",
    destino: "Almacén B",
  },
];

const naturalezas = [
  {
    codigo: "TRASLADO",
    descripcion:
      "Movimiento interno de materiales entre áreas o ubicaciones.",
  },
  {
    codigo: "DESPACHO",
    descripcion:
      "Salida de materiales hacia un destino autorizado.",
  },
  {
    codigo: "ENTREGA",
    descripcion:
      "Entrega de materiales al responsable o destino correspondiente.",
  },
];

export default function BoletasPage() {
  const navigate = useNavigate();

  const [solicitudId, setSolicitudId] = useState("");
  const [naturaleza, setNaturaleza] = useState("");
  const [observacion, setObservacion] = useState("");
  const [mensaje, setMensaje] = useState("");

  const solicitudSeleccionada = solicitudesDemo.find(
    (solicitud) => solicitud.id === solicitudId
  );

  function crearBoleta(evento) {
    evento.preventDefault();
    setMensaje("");

    if (!solicitudId) {
      setMensaje("Selecciona una solicitud de salida.");
      return;
    }

    if (!naturaleza) {
      setMensaje("Selecciona la naturaleza documental.");
      return;
    }

    const boleta = {
      id: `BOR-${Date.now()}`,
      numero: `BOL-${String(Date.now()).slice(-4)}`,
      estado: "BORRADOR",
      fecha: new Date().toLocaleDateString("es-BO"),
      solicitudId: solicitudSeleccionada.id,
      orden: solicitudSeleccionada.orden,
      cantidad: solicitudSeleccionada.cantidad,
      unidad: solicitudSeleccionada.unidad,
      destino: solicitudSeleccionada.destino,
      naturaleza,
      observacion,
    };

    sessionStorage.setItem(
      `boleta-${boleta.id}`,
      JSON.stringify(boleta)
    );

    navigate(`/logistica/boletas/${boleta.id}`, {
      state: { boleta },
    });
  }

  return (
    <section className="ts-page" aria-labelledby="boletas-title">
      <PageHeader
        titulo="Boletas"
        conteo="Crear boleta"
      />

      {mensaje && (
        <p className="ts-error" role="alert">
          {mensaje}
        </p>
      )}

      <div className="ts-panel">
        <div className="ts-panel-title">
          <div>
            <h2 id="boletas-title">
              Crear boleta
            </h2>
            <p>
              La boleta se genera inicialmente en estado BORRADOR.
            </p>
          </div>

          <strong>BORRADOR</strong>
        </div>

        <form onSubmit={crearBoleta}>
          <div className="ts-filters">
            <label htmlFor="solicitudId">
              Solicitud de salida *
              <select
                id="solicitudId"
                value={solicitudId}
                onChange={(e) => {
                  setSolicitudId(e.target.value);
                  setMensaje("");
                }}
              >
                <option value="">
                  Seleccionar solicitud
                </option>

                {solicitudesDemo.map((solicitud) => (
                  <option
                    key={solicitud.id}
                    value={solicitud.id}
                  >
                    {solicitud.id} — {solicitud.orden}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="naturaleza">
              Naturaleza documental *
              <select
                id="naturaleza"
                value={naturaleza}
                onChange={(e) => {
                  setNaturaleza(e.target.value);
                  setMensaje("");
                }}
              >
                <option value="">
                  Seleccionar
                </option>

                {naturalezas.map((item) => (
                  <option
                    key={item.codigo}
                    value={item.codigo}
                  >
                    {item.codigo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {solicitudSeleccionada && (
            <div
              className="ts-panel"
              style={{ marginTop: "1rem" }}
            >
              <div className="ts-panel-title">
                <h3>
                  Datos de la solicitud
                </h3>
              </div>

              <div className="ts-filters">
                <div>
                  <strong>Solicitud</strong>
                  <p>{solicitudSeleccionada.id}</p>
                </div>

                <div>
                  <strong>Orden</strong>
                  <p>{solicitudSeleccionada.orden}</p>
                </div>

                <div>
                  <strong>Cantidad</strong>
                  <p>
                    {solicitudSeleccionada.cantidad}{" "}
                    {solicitudSeleccionada.unidad}
                  </p>
                </div>

                <div>
                  <strong>Destino</strong>
                  <p>{solicitudSeleccionada.destino}</p>
                </div>
              </div>
            </div>
          )}

          <label style={{ marginTop: "1rem" }}>
            Observación
            <textarea
              rows="3"
              value={observacion}
              onChange={(e) =>
                setObservacion(e.target.value)
              }
              placeholder="Observación opcional"
            />
          </label>

          <div
            className="ts-panel"
            style={{ marginTop: "1rem" }}
          >
            <div className="ts-panel-title">
              <h3>
                Naturaleza documental
              </h3>
            </div>

            <div className="ts-filters">
              {naturalezas.map((item) => (
                <div key={item.codigo}>
                  <strong>{item.codigo}</strong>
                  <p>{item.descripcion}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="ts-btn-group ts-btn-group--end"
            style={{ marginTop: "1rem" }}
          >
            <button
              type="submit"
              className="ts-btn ts-btn-primary"
            >
              Crear boleta en borrador
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
=======
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listarBoletas } from "../services/boletasService.js";
import { formatearFechaHora } from "../utils/format.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// Cada estado documental con su propio color: las anuladas no se confunden con las emitidas.
const ESTADOS = {
  BORRADOR: { texto: "Borrador", clase: "ts-badge--PLANIFICADA" },
  EMITIDA: { texto: "Emitida", clase: "ts-badge--FINALIZADA" },
  ANULADA: { texto: "Anulada", clase: "ts-badge--CANCELADA" },
};

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar boletas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudieron cargar las boletas.";
}

export default function BoletasPage() {
  const [boletas, setBoletas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargar() {
    setCargando(true);
    setError("");

    try {
      const respuesta = await listarBoletas();
      setBoletas(Array.isArray(respuesta) ? respuesta : []);
    } catch (fallo) {
      setBoletas([]);
      setError(mensajeError(fallo));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    document.title = FORMATO_TITULO("Boletas");
  }, []);

  return (
    <section className="ts-page" aria-labelledby="boletas-titulo">
      <PageHeader
        titulo="Boletas de envío"
        descripcion="Documentos de salida generados desde solicitudes de salida."
        conteo={!cargando && !error ? `${boletas.length} ${boletas.length === 1 ? "boleta" : "boletas"}` : null}
      />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="boletas-titulo">Boletas</h2>
        </div>

        {cargando ? (
          <p className="ts-feedback" role="status">Cargando boletas…</p>
        ) : error ? (
          <div className="ts-feedback ts-error" role="alert">
            <p>{error}</p>
            <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
          </div>
        ) : boletas.length === 0 ? (
          <p className="ts-empty">Todavía no hay boletas registradas.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Boletas de envío guardadas</caption>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Solicitud de salida</th>
                  <th scope="col" className="ts-num">Ítems</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {boletas.map((b) => {
                  const estado = ESTADOS[b.estado];
                  const { fecha, hora } = formatearFechaHora(b.creadoEn);

                  return (
                    <tr key={b.id}>
                      <td className="ts-code">{b.numero}</td>
                      <td>
                        <span className={`ts-badge ${estado?.clase ?? "ts-badge--inactivo"}`}>
                          {estado?.texto ?? b.estado}
                        </span>
                      </td>
                      <td>#{b.solicitudSalidaId}</td>
                      <td className="ts-num">{Array.isArray(b.items) ? b.items.length : "—"}</td>
                      <td>{fecha} {hora}</td>
                      <td>
                        <Link className="ts-btn ts-btn--sm" to={`/logistica/boletas/${b.id}`}>
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
>>>>>>> origin/develop
