import { useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";

const leyenda = [
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
    return "—";
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
            No existe información disponible para la boleta
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
              Boleta {boleta.numero ?? "—"}
            </h2>

            <p>Documento de salida</p>
          </div>

          <strong>{estado}</strong>
        </div>

        <div className="ts-filters">
          <div>
            <strong>Número</strong>
            <p>{boleta.numero ?? "—"}</p>
          </div>

          <div>
            <strong>Responsable</strong>
            <p>{boleta.responsable ?? "—"}</p>
          </div>

          <div>
            <strong>Naturaleza documental</strong>
            <p>{boleta.naturaleza ?? "—"}</p>
          </div>

          <div>
            <strong>Solicitud</strong>
            <p>{boleta.solicitudId ?? "—"}</p>
          </div>

          <div>
            <strong>Orden</strong>
            <p>{boleta.orden ?? "—"}</p>
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
                placeholder="Ej. Almacén A"
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
                placeholder="Ej. Área de Producción"
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
              Esta boleta está emitida y la cabecera
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
          <h3>Ítems definitivos</h3>
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
            No hay ítems definitivos registrados en
            esta boleta.
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