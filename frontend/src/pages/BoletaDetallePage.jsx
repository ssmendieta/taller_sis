import { useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";

const leyenda = [
  {
    codigo: "TRASLADO",
    descripcion:
      "Movimiento interno de materiales entre Ã¡reas o ubicaciones.",
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

function leerBoleta(id, boletaEstado) {
  if (boletaEstado && typeof boletaEstado === "object") {
    return boletaEstado;
  }

  if (!id) {
    return null;
  }

  try {
    const valor = sessionStorage.getItem(`boleta-${id}`);
    return valor ? JSON.parse(valor) : null;
  } catch {
    return null;
  }
}

function fechaParaInput(fecha) {
  if (!fecha) {
    return "";
  }

  const valor = String(fecha).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return valor;
  }

  const partes = valor.split("/");

  if (
    partes.length === 3 &&
    partes.every((parte) => /^\d+$/.test(parte))
  ) {
    const [dia, mes, anio] = partes;

    return `${anio.padStart(4, "0")}-${mes.padStart(
      2,
      "0"
    )}-${dia.padStart(2, "0")}`;
  }

  return "";
}

function fechaParaMostrar(fecha) {
  if (!fecha) {
    return "â€”";
  }

  const valor = String(fecha);

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [anio, mes, dia] = valor.split("-");

    return `${dia}/${mes}/${anio}`;
  }

  return valor;
}

export default function BoletaDetallePage() {
  const { id } = useParams();
  const location = useLocation();
  const { usuario } = useSesion();

  const boletaInicial = leerBoleta(
    id,
    location.state?.boleta
  );

  const [boleta, setBoleta] = useState(boletaInicial);

  const [cabecera, setCabecera] = useState(() => ({
    origen: boletaInicial?.origen ?? "",
    destino: boletaInicial?.destino ?? "",
    fecha: fechaParaInput(boletaInicial?.fecha),
    cantidad: boletaInicial?.cantidad ?? "",
  }));

  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  if (!boleta) {
    return (
      <section
        className="ts-page"
        aria-labelledby="boleta-no-encontrada"
      >
        <PageHeader
          titulo="Detalle de boleta"
          conteo="No disponible"
        />

        <div className="ts-panel">
          <h2 id="boleta-no-encontrada">
            Boleta no encontrada
          </h2>

          <p>
            No existe informaciÃ³n disponible para la boleta
            solicitada.
          </p>
        </div>
      </section>
    );
  }

  const estado = String(
    boleta.estado ?? "BORRADOR"
  ).toUpperCase();

  const esBorrador = estado === "BORRADOR";

  const items = Array.isArray(boleta.items)
    ? boleta.items
    : [];

  function cambiarCampo(campo, valor) {
    setCabecera((actual) => ({
      ...actual,
      [campo]: valor,
    }));

    setErrores((actual) => {
      const siguientes = { ...actual };
      delete siguientes[campo];
      return siguientes;
    });

    setMensaje("");
  }

  function validarCabecera() {
    const nuevosErrores = {};

    if (!cabecera.origen.trim()) {
      nuevosErrores.origen =
        "El origen es obligatorio.";
    }

    if (!cabecera.destino.trim()) {
      nuevosErrores.destino =
        "El destino es obligatorio.";
    }

    if (!cabecera.fecha) {
      nuevosErrores.fecha =
        "La fecha es obligatoria.";
    }

    const cantidad = Number(cabecera.cantidad);

    if (
      cabecera.cantidad === "" ||
      cabecera.cantidad === null ||
      cabecera.cantidad === undefined
    ) {
      nuevosErrores.cantidad =
        "La cantidad es obligatoria.";
    } else if (
      !Number.isFinite(cantidad) ||
      cantidad <= 0
    ) {
      nuevosErrores.cantidad =
        "La cantidad debe ser mayor que 0.";
    }

    setErrores(nuevosErrores);

    return nuevosErrores;
  }

  function guardarCabecera(evento) {
    evento.preventDefault();
    setMensaje("");

    if (!esBorrador) {
      setMensaje(
        "La boleta emitida no puede modificarse."
      );
      return;
    }

    const nuevosErrores = validarCabecera();

    if (Object.keys(nuevosErrores).length > 0) {
      return;
    }

    const actualizada = {
      ...boleta,
      origen: cabecera.origen.trim(),
      destino: cabecera.destino.trim(),
      fecha: fechaParaMostrar(cabecera.fecha),
      cantidad: Number(cabecera.cantidad),
    };

    sessionStorage.setItem(
      `boleta-${actualizada.id}`,
      JSON.stringify(actualizada)
    );

    setBoleta(actualizada);

    setMensaje(
      "Cabecera validada y guardada correctamente."
    );
  }

  function anularBoleta(evento) {
    evento.preventDefault();
    setMensaje("");

    if (estado !== "EMITIDA") {
      setMensaje("Solo una boleta EMITIDA puede ser anulada.");
      return;
    }

    const motivo = motivoAnulacion.trim();

    if (!motivo) {
      setMensaje("El motivo de anulación es obligatorio.");
      return;
    }

    const nombreUsuario =
      usuario?.nombreCompleto ||
      usuario?.nombre ||
      usuario?.username ||
      usuario?.usuario ||
      usuario?.email ||
      "Usuario autenticado";

    const fechaHora = new Date().toISOString();

    const nuevoHistorial = [
      ...historial,
      {
        fechaHora,
        accion: "ANULACION",
        estadoAnterior: "EMITIDA",
        estadoNuevo: "ANULADA",
        usuario: nombreUsuario,
        motivo,
      },
    ];

    const actualizada = {
      ...boleta,
      estado: "ANULADA",
      motivoAnulacion: motivo,
      anuladoPor: nombreUsuario,
      fechaAnulacion: fechaHora,
      historial: nuevoHistorial,
    };

    sessionStorage.setItem(
      `boleta-${actualizada.id}`,
      JSON.stringify(actualizada)
    );

    setBoleta(actualizada);
    setMotivoAnulacion("");
    setMensaje(
      "Boleta anulada correctamente. El documento original permanece visible."
    );
  }
  function estiloCampo(campo) {
    if (!errores[campo]) {
      return undefined;
    }

    return {
      borderColor: "#c62828",
      boxShadow: "0 0 0 1px #c62828",
    };
  }

  return (
    <section
      className="ts-page"
      aria-labelledby="boleta-title"
    >
      <PageHeader
        titulo="Detalle de boleta"
        conteo={
          esBorrador
            ? "Boleta en borrador"
            : "Boleta emitida"
        }
      />

      {mensaje && (
        <p
          className={
            mensaje.includes("correctamente")
              ? "ts-success"
              : "ts-error"
          }
          role="alert"
        >
          {mensaje}
        </p>
      )}

      <div className="ts-panel">
        <div className="ts-panel-title">
          <div>
            <h2 id="boleta-title">
              Boleta {boleta.numero ?? "â€”"}
            </h2>

            <p>Documento de salida</p>
          </div>

          <strong>{estado}</strong>
        </div>

        <div className="ts-filters">
          <div>
            <strong>NÃºmero</strong>
            <p>{boleta.numero ?? "â€”"}</p>
          </div>

          <div>
            <strong>Responsable</strong>
            <p>{boleta.responsable ?? "â€”"}</p>
          </div>

          <div>
            <strong>Naturaleza documental</strong>
            <p>{boleta.naturaleza ?? "â€”"}</p>
          </div>

          <div>
            <strong>Solicitud</strong>
            <p>{boleta.solicitudId ?? "â€”"}</p>
          </div>

          <div>
            <strong>Orden</strong>
            <p>{boleta.orden ?? "â€”"}</p>
          </div>
        </div>
      </div>

      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
      >
        <div className="ts-panel-title">
          <div>
            <h3>Cabecera de la boleta</h3>

            <p>
              Los errores se muestran junto al campo
              que debe corregirse.
            </p>
          </div>
        </div>

        <form
          onSubmit={guardarCabecera}
          noValidate
        >
          <div className="ts-filters">
            <label htmlFor="origen-boleta">
              Origen *

              <input
                id="origen-boleta"
                type="text"
                value={cabecera.origen}
                onChange={(e) =>
                  cambiarCampo(
                    "origen",
                    e.target.value
                  )
                }
                aria-invalid={Boolean(
                  errores.origen
                )}
                aria-describedby={
                  errores.origen
                    ? "error-origen"
                    : undefined
                }
                disabled={!esBorrador}
                style={estiloCampo("origen")}
                placeholder="Ej. AlmacÃ©n A"
              />

              {errores.origen && (
                <span
                  id="error-origen"
                  className="ts-error"
                  role="alert"
                >
                  {errores.origen}
                </span>
              )}
            </label>

            <label htmlFor="destino-boleta">
              Destino *

              <input
                id="destino-boleta"
                type="text"
                value={cabecera.destino}
                onChange={(e) =>
                  cambiarCampo(
                    "destino",
                    e.target.value
                  )
                }
                aria-invalid={Boolean(
                  errores.destino
                )}
                aria-describedby={
                  errores.destino
                    ? "error-destino"
                    : undefined
                }
                disabled={!esBorrador}
                style={estiloCampo("destino")}
                placeholder="Ej. Ãrea de ProducciÃ³n"
              />

              {errores.destino && (
                <span
                  id="error-destino"
                  className="ts-error"
                  role="alert"
                >
                  {errores.destino}
                </span>
              )}
            </label>

            <label htmlFor="fecha-boleta">
              Fecha *

              <input
                id="fecha-boleta"
                type="date"
                value={cabecera.fecha}
                onChange={(e) =>
                  cambiarCampo(
                    "fecha",
                    e.target.value
                  )
                }
                aria-invalid={Boolean(
                  errores.fecha
                )}
                aria-describedby={
                  errores.fecha
                    ? "error-fecha"
                    : undefined
                }
                disabled={!esBorrador}
                style={estiloCampo("fecha")}
              />

              {errores.fecha && (
                <span
                  id="error-fecha"
                  className="ts-error"
                  role="alert"
                >
                  {errores.fecha}
                </span>
              )}
            </label>

            <label htmlFor="cantidad-boleta">
              Cantidad *

              <input
                id="cantidad-boleta"
                type="number"
                min="0"
                step="0.01"
                value={cabecera.cantidad}
                onChange={(e) =>
                  cambiarCampo(
                    "cantidad",
                    e.target.value
                  )
                }
                aria-invalid={Boolean(
                  errores.cantidad
                )}
                aria-describedby={
                  errores.cantidad
                    ? "error-cantidad"
                    : undefined
                }
                disabled={!esBorrador}
                style={estiloCampo("cantidad")}
                placeholder="Ej. 10"
              />

              {errores.cantidad && (
                <span
                  id="error-cantidad"
                  className="ts-error"
                  role="alert"
                >
                  {errores.cantidad}
                </span>
              )}
            </label>
          </div>

          {esBorrador ? (
            <div
              className="ts-btn-group ts-btn-group--end"
              style={{ marginTop: "1rem" }}
            >
              <button
                type="submit"
                className="ts-btn ts-btn-primary"
              >
                Guardar cabecera
              </button>
            </div>
          ) : (
            <p
              className="ts-error"
              role="status"
              style={{ marginTop: "1rem" }}
            >
              Esta boleta estÃ¡ emitida y la cabecera
              se muestra en modo consulta.
            </p>
          )}
        </form>
      </div>

      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
      >
        <div className="ts-panel-title">
          <h3>Ãtems definitivos</h3>
        </div>

        {items.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table className="ts-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr
                    key={`${item.material}-${item.unidad}`}
                  >
                    <td>{item.material}</td>
                    <td>{item.cantidad}</td>
                    <td>{item.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            No hay Ã­tems definitivos registrados en
            esta boleta.
          </p>
        )}
      </div>

      {estado === "EMITIDA" && (
        <div
          className="ts-panel"
          style={{ marginTop: "1rem" }}
          data-feature="ABC-247"
        >
          <div className="ts-panel-title">
            <div>
              <h3>Anulación de boleta</h3>
              <p>
                La anulación requiere un motivo y registra la identidad
                del usuario que realiza la operación.
              </p>
            </div>
            <strong>EMITIDA</strong>
          </div>

          <form onSubmit={anularBoleta} noValidate>
            <label htmlFor="motivo-anulacion">
              Motivo de anulación *

              <textarea
                id="motivo-anulacion"
                value={motivoAnulacion}
                onChange={(e) => {
                  setMotivoAnulacion(e.target.value);
                  setMensaje("");
                }}
                rows="3"
                placeholder="Explique el motivo de la anulación."
                required
                style={{
                  width: "100%",
                  marginTop: "0.5rem",
                  padding: "10px",
                  border: "1px solid var(--ts-border)",
                  borderRadius: "var(--ts-radius-control)",
                  font: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </label>

            <div
              className="ts-btn-group ts-btn-group--end"
              style={{ marginTop: "1rem" }}
            >
              <button
                type="submit"
                className="ts-btn ts-btn-danger"
              >
                Anular boleta
              </button>
            </div>
          </form>
        </div>
      )}

      {estado === "ANULADA" && (
        <div
          className="ts-panel"
          style={{ marginTop: "1rem" }}
          data-feature="ABC-247"
        >
          <div className="ts-panel-title">
            <div>
              <h3>Boleta anulada</h3>
              <p>
                El documento original permanece visible para consulta.
              </p>
            </div>
            <strong>ANULADA</strong>
          </div>

          <div className="ts-filters">
            <div>
              <strong>Motivo</strong>
              <p>{boleta.motivoAnulacion ?? "—"}</p>
            </div>

            <div>
              <strong>Anulado por</strong>
              <p>{boleta.anuladoPor ?? "—"}</p>
            </div>

            <div>
              <strong>Fecha de anulación</strong>
              <p>
                {boleta.fechaAnulacion
                  ? new Date(
                      boleta.fechaAnulacion
                    ).toLocaleString("es-BO")
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
        data-feature="ABC-247"
      >
        <div className="ts-panel-title">
          <div>
            <h3>Historial de la boleta</h3>
            <p>
              Registro de cambios y acciones realizadas sobre el documento.
            </p>
          </div>

          <strong>{historial.length}</strong>
        </div>

        {historial.length > 0 ? (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Historial de la boleta</caption>

              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Acción</th>
                  <th>Estado anterior</th>
                  <th>Estado nuevo</th>
                  <th>Usuario</th>
                  <th>Motivo</th>
                </tr>
              </thead>

              <tbody>
                {historial.map((evento, indice) => (
                  <tr
                    key={`${evento.fechaHora ?? "evento"}-${indice}`}
                  >
                    <td>
                      {evento.fechaHora
                        ? new Date(
                            evento.fechaHora
                          ).toLocaleString("es-BO")
                        : "—"}
                    </td>

                    <td>{evento.accion ?? "—"}</td>
                    <td>{evento.estadoAnterior ?? "—"}</td>
                    <td>{evento.estadoNuevo ?? "—"}</td>
                    <td>{evento.usuario ?? "—"}</td>
                    <td>{evento.motivo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ts-empty">
            <strong>Sin movimientos registrados</strong>
            Todavía no existen eventos de historial para esta boleta.
          </p>
        )}
      </div>
      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
      >
        <div className="ts-panel-title">
          <h3>
            Leyenda de naturaleza documental
          </h3>
        </div>

        <p>
          La naturaleza documental identifica el
          tipo de movimiento registrado en la boleta.
        </p>

        <div className="ts-filters">
          {leyenda.map((item) => (
            <div key={item.codigo}>
              <strong>{item.codigo}</strong>
              <p>{item.descripcion}</p>
            </div>
          ))}
        </div>
      </div>

      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
        role="note"
      >
        <strong>Importante</strong>

        <p>
          Esta boleta representa un documento de
          salida emitido. No se presenta como
          constancia de entrega final.
        </p>
      </div>
    </section>
  );
}