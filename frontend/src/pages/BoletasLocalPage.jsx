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

export default function BoletasLocalPage() {
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

    navigate(`/logistica/boletas/local/${boleta.id}`, {
      state: { boleta },
    });
  }

  return (
    <section className="ts-page" aria-labelledby="boletas-title">
      <p className="ts-notice">Prototipo local: los cambios se guardan solo en esta sesión, no en la API de producción.</p>
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
