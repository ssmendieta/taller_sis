<<<<<<< HEAD
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { guardarBoletaLocal } from "../services/logisticaService.js";

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
    return "-";
  }

  const valor = String(fecha);

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [anio, mes, dia] = valor.split("-");

    return `${dia}/${mes}/${anio}`;
  }

  return valor;
=======
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import {
  ESTADO_BOLETA_EMITIDA,
  obtenerBoleta,
  obtenerSolicitudSalida,
} from "../services/boletasService.js";
import { obtenerOrden } from "../services/ordenesService.js";
import { formatearFechaHora, formatearNumero } from "../utils/format.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";
import "../styles/boleta-print.css";

const ETIQUETAS_ESTADO = {
  BORRADOR: "Borrador",
  EMITIDA: "Emitida",
  ANULADA: "Anulada",
};

// La API solo devuelve el id del responsable; si es quien consulta se muestra su nombre.
function responsableDe(boleta, usuario) {
  const id = boleta.responsableUsuarioId;
  if (id == null) return "—";
  if (usuario?.id != null && String(usuario.id) === String(id)) {
    return usuario.nombre_completo ?? usuario.nombre ?? `Usuario ${id}`;
  }
  return `Usuario ${id}`;
}

function fechaHoraTexto(valor) {
  if (!valor) return "—";
  const { fecha, hora } = formatearFechaHora(valor);
  return `${fecha} ${hora}`;
}

function mensajeError(fallo) {
  if (fallo?.status === 404) return "La boleta no existe.";
  if (fallo?.status === 403) return "No tienes permiso para consultar boletas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudo cargar la boleta.";
>>>>>>> origin/develop
}

export default function BoletaDetallePage() {
  const { id } = useParams();
<<<<<<< HEAD
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
  const ordenIdAsociada =
    boleta?.ordenId ??
    boleta?.orden_id ??
    (
      boleta?.orden != null &&
      String(boleta.orden).trim() !== "" &&
      Number.isFinite(Number(boleta.orden))
        ? Number(boleta.orden)
        : null
    );

  const loteAsociado =
    boleta?.loteId ??
    boleta?.lote_id ??
    boleta?.loteCodigo ??
    boleta?.lote_codigo ??
    boleta?.lote ??
    "";

  const retornoTrazabilidad =
    location.state?.retornoTrazabilidad ?? null;

  const destinoTrazabilidad =
    retornoTrazabilidad?.pathname
      ? {
          pathname: retornoTrazabilidad.pathname,
          search: retornoTrazabilidad.search ?? "",
        }
      : "/logistica/trazabilidad";

  const [lineas, setLineas] = useState(() => {
    const iniciales = Array.isArray(boletaInicial?.items)
      ? boletaInicial.items
      : [];

    return iniciales.map((item, indice) => ({
      id:
        item.id ??
        `linea-${indice + 1}`,
      material: String(item.material ?? ""),
      cantidad:
        item.cantidad === null ||
        item.cantidad === undefined
          ? ""
          : String(item.cantidad),
      unidad: String(item.unidad ?? ""),
    }));
  });

  const [erroresLineas, setErroresLineas] = useState({});

  const items = lineas;

  const historial = Array.isArray(boleta.historial)
    ? boleta.historial
    : [];

  function cambiarLinea(lineaId, campo, valor) {
    if (!esBorrador) {
      return;
    }

    setLineas((actuales) =>
      actuales.map((linea) =>
        linea.id === lineaId
          ? {
              ...linea,
              [campo]: valor,
            }
          : linea
      )
    );

    const claveError = `${lineaId}.${campo}`;

    setErroresLineas((actuales) => {
      const siguientes = { ...actuales };
      delete siguientes[claveError];
      return siguientes;
    });

    setMensaje("");
  }

  function agregarLinea() {
    if (!esBorrador) {
      return;
    }

    const id =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `linea-${Date.now()}`;

    setLineas((actuales) => [
      ...actuales,
      {
        id,
        material: "",
        cantidad: "",
        unidad: "",
      },
    ]);

    setMensaje("");
  }

  function eliminarLinea(lineaId) {
    if (!esBorrador) {
      return;
    }

    setLineas((actuales) =>
      actuales.filter((linea) => linea.id !== lineaId)
    );

    const prefijo = `${lineaId}.`;

    setErroresLineas((actuales) =>
      Object.fromEntries(
        Object.entries(actuales).filter(
          ([clave]) => !clave.startsWith(prefijo)
        )
      )
    );

    setMensaje("");
  }

  function validarLineas() {
    const nuevosErrores = {};

    lineas.forEach((linea) => {
      const material = String(linea.material ?? "").trim();
      const unidad = String(linea.unidad ?? "").trim();
      const cantidad = Number(linea.cantidad);

      if (!material) {
        nuevosErrores[`${linea.id}.material`] =
          "El material es obligatorio.";
      }

      if (!unidad) {
        nuevosErrores[`${linea.id}.unidad`] =
          "La unidad es obligatoria.";
      }

      if (
        linea.cantidad === "" ||
        linea.cantidad === null ||
        linea.cantidad === undefined
      ) {
        nuevosErrores[`${linea.id}.cantidad`] =
          "La cantidad es obligatoria.";
      } else if (
        !Number.isFinite(cantidad) ||
        cantidad <= 0
      ) {
        nuevosErrores[`${linea.id}.cantidad`] =
          "La cantidad debe ser mayor que 0.";
      }
    });

    setErroresLineas(nuevosErrores);

    return nuevosErrores;
  }

  function estiloErrorLinea(lineaId, campo) {
    if (!erroresLineas[`${lineaId}.${campo}`]) {
      return undefined;
    }

    return {
      borderColor: "#c62828",
      boxShadow: "0 0 0 1px #c62828",
    };
  }

  function guardarLineas() {
    setMensaje("");

    if (!esBorrador) {
      setMensaje(
        "La boleta emitida no puede modificarse."
      );
      return;
    }

    const nuevosErrores = validarLineas();

    if (Object.keys(nuevosErrores).length > 0) {
      setMensaje(
        "Corrige los errores de las líneas antes de guardar."
      );
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

    const lineasValidas = lineas.map((linea) => ({
      ...linea,
      material: String(linea.material).trim(),
      cantidad: Number(linea.cantidad),
      unidad: String(linea.unidad).trim(),
    }));

    const actualizada = {
      ...boleta,
      items: lineasValidas,
      ultimoCambioFecha: fechaHora,
      ultimoCambioPor: nombreUsuario,
    };

    guardarBoletaLocal(actualizada);

    setLineas(lineasValidas);
    setBoleta(actualizada);

    setMensaje(
      "Líneas validadas y guardadas correctamente."
    );
  }
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

    const nombreUsuario =
      usuario?.nombreCompleto ||
      usuario?.nombre ||
      usuario?.username ||
      usuario?.usuario ||
      usuario?.email ||
      "Usuario autenticado";

    const fechaHora = new Date().toISOString();
    const actualizada = {
      ...boleta,
      origen: cabecera.origen.trim(),
      destino: cabecera.destino.trim(),
      fecha: fechaParaMostrar(cabecera.fecha),
      cantidad: Number(cabecera.cantidad),
      ultimoCambioFecha: fechaHora,
      ultimoCambioPor: nombreUsuario,
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

  function emitirBoleta() {
    setMensaje("");

    if (estado !== "BORRADOR") {
      setMensaje(
        "Solo una boleta en BORRADOR puede ser emitida."
      );
      return;
    }

    const confirmar = window.confirm(
      "¿Está seguro de emitir esta boleta? Una vez emitida, la cabecera no podrá modificarse."
    );

    if (!confirmar) {
      setMensaje(
        "Emisión cancelada. La boleta permanece en BORRADOR."
      );
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

    const historialActual = Array.isArray(boleta.historial)
      ? boleta.historial
      : [];

    const actualizada = {
      ...boleta,
      estado: "EMITIDA",
      fechaEmision: fechaHora,
      emitidaPor: nombreUsuario,
      historial: [
        ...historialActual,
        {
          fechaHora,
          accion: "EMISION",
          estadoAnterior: "BORRADOR",
          estadoNuevo: "EMITIDA",
          usuario: nombreUsuario,
          motivo: "",
        },
      ],
    };

    sessionStorage.setItem(
      `boleta-${actualizada.id}`,
      JSON.stringify(actualizada)
    );

    setBoleta(actualizada);

    setMensaje(
      "Boleta emitida correctamente."
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
              Boleta {boleta.numero ?? "-"}
            </h2>

            <p>Documento de salida</p>
          </div>

          <strong>{estado}</strong>
        </div>

        <div className="ts-filters">
          <div>
            <strong>Número</strong>
            <p>{boleta.numero ?? "-"}</p>
          </div>

          <div>
            <strong>Responsable</strong>
            <p>{boleta.responsable ?? "-"}</p>
          </div>

          <div>
            <strong>Naturaleza documental</strong>
            <p>{boleta.naturaleza ?? "-"}</p>
          </div>

          <div>
            <strong>Solicitud</strong>
            <p>{boleta.solicitudId ?? "-"}</p>
          </div>

          <div>
            <strong>Orden</strong>
            <p>{boleta.orden ?? "-"}</p>
          </div>
        </div>
      </div>
      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
        data-feature="ABC-308"
      >
        <div className="ts-panel-title">
          <div>
            <h3>Vinculación documental</h3>
            <p>
              Navega entre la boleta, la orden de producción
              y el lote asociado.
            </p>
          </div>
        </div>

        <div className="ts-filters">

          <div>
            <strong>Orden de producción</strong>

            {ordenIdAsociada ? (
              <div style={{ marginTop: "0.5rem" }}>
                <Link
                  className="ts-btn"
                  to={`/ordenes/${encodeURIComponent(
                    ordenIdAsociada
                  )}`}
                  state={{
                    retornoTrazabilidad,
                  }}
                >
                  Consultar orden
                </Link>
              </div>
            ) : (
              <p>No existe orden asociada</p>
            )}
          </div>

          <div>
            <strong>Lote</strong>

            {loteAsociado ? (
              <div style={{ marginTop: "0.5rem" }}>
                <Link
                  className="ts-btn"
                  to={`/logistica/trazabilidad?loteId=${encodeURIComponent(
                    loteAsociado
                  )}`}
                  state={{
                    retornoBoleta: location.pathname,
                  }}
                >
                  Consultar lote
                </Link>
              </div>
            ) : (
              <p>No existe lote asociado</p>
            )}
          </div>

          <div>
            <strong>Trazabilidad</strong>

            <div style={{ marginTop: "0.5rem" }}>
              <Link
                className="ts-btn"
                to="/logistica/trazabilidad"
                state={{
                  retornoBoleta: location.pathname,
                }}
              >
                Ver trazabilidad
              </Link>
            </div>
          </div>

          {retornoTrazabilidad && (
            <div>
              <strong>Retorno</strong>

              <div style={{ marginTop: "0.5rem" }}>
                <Link
                  className="ts-btn ts-btn-primary"
                  to={destinoTrazabilidad}
                >
                  Volver a trazabilidad
                </Link>
              </div>
            </div>
          )}

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

              <button
                type="button"
                className="ts-btn ts-btn-primary"
                onClick={emitirBoleta}
                data-feature="ABC-234"
              >
                Emitir boleta
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
        {esBorrador && (
          <div
            className="ts-panel"
            style={{ marginTop: "1rem" }}
            data-feature="ABC-222"
          >
            <div className="ts-panel-title">
              <h3>Último cambio del borrador</h3>
            </div>

            <div className="ts-filters">
              <div>
                <strong>Fecha y hora</strong>
                <p>
                  {boleta.ultimoCambioFecha
                    ? new Date(
                        boleta.ultimoCambioFecha
                      ).toLocaleString("es-BO", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "Sin cambios registrados"}
                </p>
              </div>

              <div>
                <strong>Autor</strong>
                <p>
                  {boleta.ultimoCambioPor ??
                    "Sin autor registrado"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
      >
        <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
        data-feature="ABC-221"
      >
        <div className="ts-panel-title">
          <div>
            <h3>
              {esBorrador
                ? "Editor de líneas"
                : "Ítems definitivos"}
            </h3>

            {esBorrador && (
              <p>
                Agrega, modifica o elimina líneas antes
                de emitir la boleta.
              </p>
            )}
          </div>
        </div>

        {esBorrador ? (
          <>
            {lineas.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table className="ts-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Cantidad</th>
                      <th>Unidad</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lineas.map((linea) => (
                      <tr key={linea.id}>
                        <td>
                          <label
                            htmlFor={`material-${linea.id}`}
                          >
                            <span className="sr-only">
                              Material
                            </span>

                            <input
                              id={`material-${linea.id}`}
                              type="text"
                              value={linea.material}
                              onChange={(e) =>
                                cambiarLinea(
                                  linea.id,
                                  "material",
                                  e.target.value
                                )
                              }
                              aria-invalid={Boolean(
                                erroresLineas[
                                  `${linea.id}.material`
                                ]
                              )}
                              aria-describedby={
                                erroresLineas[
                                  `${linea.id}.material`
                                ]
                                  ? `error-${linea.id}-material`
                                  : undefined
                              }
                              style={estiloErrorLinea(
                                linea.id,
                                "material"
                              )}
                              placeholder="Ej. Materia prima A"
                            />

                            {erroresLineas[
                              `${linea.id}.material`
                            ] && (
                              <span
                                id={`error-${linea.id}-material`}
                                className="ts-error"
                                role="alert"
                              >
                                {
                                  erroresLineas[
                                    `${linea.id}.material`
                                  ]
                                }
                              </span>
                            )}
                          </label>
                        </td>

                        <td>
                          <label
                            htmlFor={`cantidad-${linea.id}`}
                          >
                            <span className="sr-only">
                              Cantidad
                            </span>

                            <input
                              id={`cantidad-${linea.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={linea.cantidad}
                              onChange={(e) =>
                                cambiarLinea(
                                  linea.id,
                                  "cantidad",
                                  e.target.value
                                )
                              }
                              aria-invalid={Boolean(
                                erroresLineas[
                                  `${linea.id}.cantidad`
                                ]
                              )}
                              aria-describedby={
                                erroresLineas[
                                  `${linea.id}.cantidad`
                                ]
                                  ? `error-${linea.id}-cantidad`
                                  : undefined
                              }
                              style={estiloErrorLinea(
                                linea.id,
                                "cantidad"
                              )}
                              placeholder="Ej. 10"
                            />

                            {erroresLineas[
                              `${linea.id}.cantidad`
                            ] && (
                              <span
                                id={`error-${linea.id}-cantidad`}
                                className="ts-error"
                                role="alert"
                              >
                                {
                                  erroresLineas[
                                    `${linea.id}.cantidad`
                                  ]
                                }
                              </span>
                            )}
                          </label>
                        </td>

                        <td>
                          <label
                            htmlFor={`unidad-${linea.id}`}
                          >
                            <span className="sr-only">
                              Unidad
                            </span>

                            <input
                              id={`unidad-${linea.id}`}
                              type="text"
                              value={linea.unidad}
                              onChange={(e) =>
                                cambiarLinea(
                                  linea.id,
                                  "unidad",
                                  e.target.value
                                )
                              }
                              aria-invalid={Boolean(
                                erroresLineas[
                                  `${linea.id}.unidad`
                                ]
                              )}
                              aria-describedby={
                                erroresLineas[
                                  `${linea.id}.unidad`
                                ]
                                  ? `error-${linea.id}-unidad`
                                  : undefined
                              }
                              style={estiloErrorLinea(
                                linea.id,
                                "unidad"
                              )}
                              placeholder="Ej. kg"
                            />

                            {erroresLineas[
                              `${linea.id}.unidad`
                            ] && (
                              <span
                                id={`error-${linea.id}-unidad`}
                                className="ts-error"
                                role="alert"
                              >
                                {
                                  erroresLineas[
                                    `${linea.id}.unidad`
                                  ]
                                }
                              </span>
                            )}
                          </label>
                        </td>

                        <td className="ts-actions">
                          <button
                            type="button"
                            className="ts-btn ts-btn-danger"
                            onClick={() =>
                              eliminarLinea(linea.id)
                            }
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No hay líneas en esta boleta.
                Agrega una línea para comenzar.
              </p>
            )}

            <div
              className="ts-btn-group ts-btn-group--end"
              style={{ marginTop: "1rem" }}
            >
              <button
                type="button"
                className="ts-btn"
                onClick={agregarLinea}
              >
                + Agregar línea
              </button>

              <button
                type="button"
                className="ts-btn ts-btn-primary"
                onClick={guardarLineas}
              >
                Guardar líneas
              </button>
            </div>
          </>
        ) : (
          <>
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
                        key={
                          item.id ??
                          `${item.material}-${item.unidad}`
                        }
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
          </>
        )}
      </div>
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
=======
  const { usuario } = useSesion();
  const [boleta, setBoleta] = useState(null);
  const [solicitud, setSolicitud] = useState(null);
  const [ordenCodigo, setOrdenCodigo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargar() {
    setCargando(true);
    setError("");

    try {
      const datos = await obtenerBoleta(id);
      const salida = await obtenerSolicitudSalida(datos.solicitudSalidaId);
      setBoleta(datos);
      setSolicitud(salida);

      // El código de la orden es opcional: requiere permiso de consulta en Producción.
      try {
        const orden = await obtenerOrden(salida.ordenId);
        setOrdenCodigo(orden?.codigo ?? null);
      } catch {
        setOrdenCodigo(null);
      }
    } catch (fallo) {
      setBoleta(null);
      setSolicitud(null);
      setError(mensajeError(fallo));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    document.title = FORMATO_TITULO(boleta?.numero ? `Boleta ${boleta.numero}` : "Boleta");
  }, [boleta?.numero]);

  if (cargando) {
    return <p className="ts-feedback" role="status">Cargando boleta…</p>;
  }

  if (error) {
    return (
      <div className="ts-feedback ts-error" role="alert">
        <p>{error}</p>
        <div className="ts-btn-group">
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
          <Link className="ts-btn" to="/logistica/boletas">Volver</Link>
        </div>
      </div>
    );
  }

  if (!boleta || !solicitud) return null;

  const emitida = boleta.estado === ESTADO_BOLETA_EMITIDA;
  const items = Array.isArray(boleta.items) ? boleta.items : [];
  const orden = ordenCodigo ?? `Orden #${solicitud.ordenId}`;
  const datos = [
    ["Número", boleta.numero],
    ["Orden", orden],
    ["Destino", solicitud.destinoDocumental],
    ["Fecha", fechaHoraTexto(boleta.creadoEn)],
    ["Responsable", responsableDe(boleta, usuario)],
    ["Solicitud de salida", `#${boleta.solicitudSalidaId}`],
  ];

  return (
    <section className="ts-page" aria-labelledby="boleta-titulo">
      <div className="boleta-pantalla">
        <PageHeader
          titulo={`Boleta ${boleta.numero}`}
          descripcion={`Estado: ${ETIQUETAS_ESTADO[boleta.estado] ?? boleta.estado}`}
          accion={
            <div className="ts-btn-group">
              {emitida && (
                <button type="button" className="ts-btn ts-btn-primary" onClick={() => window.print()}>
                  Imprimir
                </button>
              )}
              <Link className="ts-btn" to="/logistica/boletas">Volver</Link>
            </div>
          }
        />

        {!emitida && (
          <p className="ts-notice" role="note">
            Solo una boleta EMITIDA tiene formato de envío. Esta boleta está en estado{" "}
            {ETIQUETAS_ESTADO[boleta.estado]?.toLowerCase() ?? boleta.estado} y no se puede imprimir.
          </p>
        )}
      </div>

      {/* Vista previa: muestra exactamente los datos e ítems guardados. */}
      <article className={`boleta-documento${emitida ? "" : " boleta-documento--no-emitida"}`}>
        <header className="boleta-documento__cabecera">
          <div>
            <p className="boleta-documento__tipo">Boleta de envío</p>
            <h2 id="boleta-titulo">N.º {boleta.numero}</h2>
          </div>
          <span className="boleta-documento__estado">
            {ETIQUETAS_ESTADO[boleta.estado] ?? boleta.estado}
          </span>
        </header>

        <dl className="boleta-documento__datos">
          {datos.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt>{etiqueta}</dt>
              <dd>{valor || "—"}</dd>
            </div>
          ))}
        </dl>

        <table className="boleta-documento__items">
          <caption>Ítems de la boleta</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Referencia</th>
              <th scope="col" className="boleta-documento__num">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, indice) => (
              <tr key={item.id ?? indice}>
                <td>{indice + 1}</td>
                <td>{item.referencia}</td>
                <td className="boleta-documento__num">{formatearNumero(item.cantidad)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3}>La boleta no tiene ítems.</td>
              </tr>
            )}
          </tbody>
        </table>

        <footer className="boleta-documento__pie">
          Documento de salida de Logística. No reemplaza firma digital, comprobante
          del sistema de Despachos ni factura o PDF fiscal.
        </footer>
      </article>

      {!emitida && (
        <p className="boleta-no-imprimible">
          Boleta {boleta.numero} en estado {boleta.estado}: solo una boleta EMITIDA
          tiene formato de envío.
        </p>
      )}
>>>>>>> origin/develop
    </section>
  );
}
