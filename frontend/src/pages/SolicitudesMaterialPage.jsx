
import { useEffect, useRef, useState } from "react";
import { obtenerOrdenes } from "../services/ordenesService.js";
import { listarMateriales } from "../services/materiales.js";
import {
  listarSolicitudesMaterial,
  obtenerSolicitudMaterial,
  crearSolicitudMaterial,
} from "../services/solicitudesMaterialService.js";
import PageHeader from "../components/ui/PageHeader.jsx";

function nombreMaterial(material) {
  return material.nombre ?? material.descripcion ?? `Material ${material.id}`;
}

function nombreOrden(orden) {
  return orden.codigo ?? `Orden ${orden.id}`;
}

function fechaSolicitud(fecha) {
  if (!fecha) return "—";
  const valor = new Date(fecha);
  return Number.isNaN(valor.getTime())
    ? fecha
    : valor.toLocaleString("es-BO");
}

function esConflicto(error) {
  return (
    error.status === 409 ||
    /conflict|ya existe|solicitud abierta|duplicad/i.test(
      error.message || ""
    )
  );
}

export default function SolicitudesMaterialPage() {
  const [ordenes, setOrdenes] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [ordenId, setOrdenId] = useState("");
  const [items, setItems] = useState([
    { materialId: "", cantidad: "", unidad: "" },
  ]);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  // Evita envíos duplicados incluso ante clics muy rápidos.
  const envioEnCurso = useRef(false);

  async function cargarDatos(mostrarError = true) {
    setCargando(true);
    if (mostrarError) setError("");

    try {
      const [listaOrdenes, listaMateriales, listaSolicitudes] =
        await Promise.all([
          obtenerOrdenes(),
          listarMateriales(),
          listarSolicitudesMaterial(),
        ]);

      setOrdenes(Array.isArray(listaOrdenes) ? listaOrdenes : []);
      setMateriales(Array.isArray(listaMateriales) ? listaMateriales : []);
      setSolicitudes(Array.isArray(listaSolicitudes) ? listaSolicitudes : []);
    } catch (e) {
      if (mostrarError) {
        setError(e.message || "No se pudieron cargar los datos.");
      }
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  function cambiarItem(indice, campo, valor) {
    setItems((actuales) =>
      actuales.map((item, i) => {
        if (i !== indice) return item;

        if (campo === "materialId") {
          const material = materiales.find(
            (m) => String(m.id) === String(valor)
          );

          return {
            ...item,
            materialId: valor,
            unidad: material?.unidadMedida ?? "",
          };
        }

        return { ...item, [campo]: valor };
      })
    );
  }

  function agregarItem() {
    setItems((actuales) => [
      ...actuales,
      { materialId: "", cantidad: "", unidad: "" },
    ]);
  }

  function quitarItem(indice) {
    setItems((actuales) => actuales.filter((_, i) => i !== indice));
  }

  async function enviarFormulario(evento) {
    evento.preventDefault();

    if (envioEnCurso.current) return;

    setError("");
    setAviso("");

    if (!ordenId) {
      setError("Selecciona una orden de producción.");
      return;
    }

    if (
      items.length === 0 ||
      items.some(
        (item) =>
          !item.materialId ||
          !Number.isFinite(Number(item.cantidad)) ||
          Number(item.cantidad) <= 0 ||
          !item.unidad.trim()
      )
    ) {
      setError(
        "Selecciona cada material, verifica su unidad e ingresa cantidades mayores que cero."
      );
      return;
    }

    const ids = items.map((item) => String(item.materialId));

    if (new Set(ids).size !== ids.length) {
      setError(
        "No puedes repetir un material en la misma solicitud. Corrige los materiales antes de continuar."
      );
      return;
    }

    envioEnCurso.current = true;
    setGuardando(true);

    try {
      const creada = await crearSolicitudMaterial({
        ordenId: Number(ordenId),
        items: items.map((item) => ({
          materialId: Number(item.materialId),
          cantidad: Number(item.cantidad),
          unidad: item.unidad,
        })),
      });

      setAviso(
        `Solicitud ${creada.id} registrada correctamente.`
      );
      setOrdenId("");
      setItems([{ materialId: "", cantidad: "", unidad: "" }]);
      setDetalle(creada);

      // Recarga los datos desde la API.
      await cargarDatos(false);
    } catch (e) {
      if (esConflicto(e)) {
        setError(
          "Ya existe una solicitud abierta para este material y orden. Revisa la solicitud existente en el listado; no se creó otra."
        );
        await cargarDatos(false);
      } else {
        setError(
          e.message ||
            "No se pudo registrar la solicitud. Verifica los datos e inténtalo nuevamente."
        );
      }
    } finally {
      envioEnCurso.current = false;
      setGuardando(false);
    }
  }

  async function verDetalle(id) {
    setError("");
    setAviso("");

    try {
      const solicitud = await obtenerSolicitudMaterial(id);
      setDetalle(solicitud);
    } catch (e) {
      setError(e.message || "No se pudo cargar el detalle.");
    }
  }

  return (
    <section className="ts-page" aria-labelledby="solicitudes-title">
      <PageHeader titulo="Solicitudes de materiales" />

      {aviso && (
        <p className="ts-success" role="status">
          {aviso}
        </p>
      )}

      {error && (
        <p className="ts-feedback ts-error" role="alert">
          {error}
        </p>
      )}

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="solicitudes-title">Registrar solicitud</h2>
        </div>

        <form onSubmit={enviarFormulario}>
          <div className="ts-filters">
            <label htmlFor="solicitud-orden">
              Orden de producción
              <select
                id="solicitud-orden"
                value={ordenId}
                onChange={(e) => setOrdenId(e.target.value)}
                disabled={guardando}
                required
              >
                <option value="">Seleccionar orden</option>
                {ordenes.map((orden) => (
                  <option key={orden.id} value={orden.id}>
                    {nombreOrden(orden)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {items.map((item, indice) => (
            <div className="ts-filters" key={indice}>
              <label>
                Material
                <select
                  value={item.materialId}
                  onChange={(e) =>
                    cambiarItem(indice, "materialId", e.target.value)
                  }
                  disabled={guardando}
                  required
                >
                  <option value="">Seleccionar material</option>
                  {materiales.map((material) => (
                    <option key={material.id} value={material.id}>
                      {nombreMaterial(material)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cantidad faltante
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={item.cantidad}
                  onChange={(e) =>
                    cambiarItem(indice, "cantidad", e.target.value)
                  }
                  disabled={guardando}
                  required
                />
              </label>

              <label>
                Unidad
                <input
                  value={item.unidad}
                  readOnly
                  placeholder="Elige material"
                />
              </label>

              {items.length > 1 && (
                <button
                  type="button"
                  className="ts-btn ts-btn-quiet"
                  onClick={() => quitarItem(indice)}
                  disabled={guardando}
                >
                  Quitar
                </button>
              )}
            </div>
          ))}

          <div className="ts-actions">
            <button
              type="button"
              className="ts-btn"
              onClick={agregarItem}
              disabled={guardando}
            >
              Agregar material
            </button>

            <button
              type="submit"
              className="ts-btn ts-btn-primary"
              disabled={guardando || cargando}
            >
              {guardando ? "Registrando..." : "Registrar solicitud"}
            </button>
          </div>
        </form>
      </div>

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2>Listado de solicitudes</h2>
          <button
            type="button"
            className="ts-btn"
            onClick={() => cargarDatos()}
            disabled={cargando || guardando}
          >
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {cargando ? (
          <p className="ts-feedback">Cargando solicitudes...</p>
        ) : solicitudes.length === 0 ? (
          <p className="ts-feedback">
            Todavía no hay solicitudes registradas.
          </p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Orden</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((solicitud) => (
                  <tr key={solicitud.id}>
                    <td>{solicitud.id}</td>
                    <td>
                      {solicitud.orden?.codigo ??
                        solicitud.ordenId ??
                        "—"}
                    </td>
                    <td>{fechaSolicitud(solicitud.fecha)}</td>
                    <td>{solicitud.estado ?? "PENDIENTE"}</td>
                    <td>
                      <button
                        type="button"
                        className="ts-btn"
                        onClick={() => verDetalle(solicitud.id)}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalle && (
        <div className="ts-panel">
          <div className="ts-panel-title">
            <h2>Detalle de solicitud #{detalle.id}</h2>
            <button
              type="button"
              className="ts-btn ts-btn-quiet"
              onClick={() => setDetalle(null)}
            >
              Cerrar detalle
            </button>
          </div>

          <p>
            <strong>Orden:</strong>{" "}
            {detalle.orden?.codigo ?? detalle.ordenId ?? "—"}
          </p>
          <p>
            <strong>Estado:</strong> {detalle.estado ?? "PENDIENTE"}
          </p>
          <p>
            <strong>Fecha:</strong> {fechaSolicitud(detalle.fecha)}
          </p>

          <div className="ts-table-wrap">
            <table className="ts-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.items ?? []).map((item) => (
                  <tr key={item.id ?? `${item.materialId}-${item.unidad}`}>
                    <td>
                      {item.material?.nombre ??
                        item.material?.descripcion ??
                        item.materialId}
                    </td>
                    <td>{item.cantidad}</td>
                    <td>{item.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
