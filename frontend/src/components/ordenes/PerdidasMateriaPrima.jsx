import { useEffect, useRef, useState } from "react";
import {
  MAX_MOTIVO_PERDIDA,
  listarPerdidasOrden,
  registrarPerdida,
} from "../../services/perdidasMateriaPrimaService.js";
import { formatearCantidad } from "../../utils/format.js";
import { mostrarFechaHora } from "../../utils/formato.js";

const ESTILO_CAMPO = { minHeight: 36, padding: "7px 10px", border: "1px solid #e0e0e2", borderRadius: 5 };
const ESTILO_ETIQUETA = { display: "flex", flexDirection: "column", gap: 5, maxWidth: 420, marginBottom: 12 };

function autorDe(perdida, usuario) {
  const id = perdida.autorUsuarioId;
  if (id == null) return "—";
  if (usuario?.id != null && String(usuario.id) === String(id)) {
    return usuario.nombre_completo ?? usuario.nombre ?? `Usuario ${id}`;
  }
  return `Usuario ${id}`;
}

// ABC-74: mermas de materia prima de la orden. Panel propio, separado de calidad
// (conformes/defectuosos): no lee ni escribe resultados de calidad.
export default function PerdidasMateriaPrima({ ordenId, materiales, permiteRegistrar, usuario }) {
  const [perdidas, setPerdidas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const envioEnCurso = useRef(false);

  const material = materiales.find((m) => String(m.id) === String(materialId));

  async function cargar() {
    setCargando(true);
    setErrorCarga("");
    try {
      const respuesta = await listarPerdidasOrden(ordenId);
      setPerdidas(Array.isArray(respuesta) ? respuesta : []);
    } catch (fallo) {
      setPerdidas([]);
      setErrorCarga(fallo.message || "No se pudieron cargar las pérdidas de la orden.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenId]);

  async function guardar(evento) {
    evento.preventDefault();
    // Evita el doble envío aunque se pulse dos veces antes de re-renderizar.
    if (envioEnCurso.current) return;

    setError("");
    setAviso("");

    const valor = Number(cantidad);
    const texto = motivo.trim();

    if (!material) {
      setError("Selecciona un material de la receta.");
      return;
    }
    if (!cantidad || !Number.isFinite(valor) || valor <= 0) {
      setError("La cantidad perdida debe ser mayor que cero.");
      return;
    }
    if (Number(valor.toFixed(4)) !== valor) {
      setError("La cantidad admite como máximo 4 decimales.");
      return;
    }
    if (!texto) {
      setError("Indica el motivo de la pérdida.");
      return;
    }

    envioEnCurso.current = true;
    setGuardando(true);

    try {
      await registrarPerdida({
        ordenId: Number(ordenId),
        materialId: Number(material.id),
        cantidad: valor,
        unidad: material.unidad,
        motivo: texto,
      });
      setCantidad("");
      setMotivo("");
      setAviso("Pérdida registrada.");
      // Se vuelve a pedir la lista a la API: muestra lo guardado sin recargar la página.
      await cargar();
    } catch (fallo) {
      setError(fallo.message || "No se pudo registrar la pérdida.");
    } finally {
      envioEnCurso.current = false;
      setGuardando(false);
    }
  }

  return (
    <div className="ts-panel" style={{ marginBottom: 16 }}>
      <div className="ts-panel-title">
        <h2>Pérdidas de materia prima</h2>
        <span>{perdidas.length} registros</span>
      </div>

      <p className="ts-field-help" role="note" style={{ padding: "0 20px" }}>
        Mermas de insumos de esta orden. No son productos defectuosos ni cambian
        las existencias de Inventarios.
      </p>

      {permiteRegistrar ? (
        <form onSubmit={guardar} noValidate style={{ padding: "12px 20px 16px" }}>
          <label htmlFor="perdida-material" style={ESTILO_ETIQUETA}>
            Material
            <select
              id="perdida-material"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              disabled={guardando}
              style={ESTILO_CAMPO}
            >
              <option value="">Selecciona un material</option>
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.codigo}) — {m.unidad}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="perdida-cantidad" style={{ ...ESTILO_ETIQUETA, maxWidth: 320 }}>
            Cantidad perdida{material?.unidad ? ` (en ${material.unidad})` : ""}
            <input
              id="perdida-cantidad"
              type="number"
              min="0.0001"
              step="0.0001"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              disabled={guardando}
              style={ESTILO_CAMPO}
            />
          </label>

          <label htmlFor="perdida-motivo" style={{ ...ESTILO_ETIQUETA, maxWidth: 520 }}>
            Motivo *
            <input
              id="perdida-motivo"
              type="text"
              maxLength={MAX_MOTIVO_PERDIDA}
              placeholder="Ej.: derrame en mezcladora"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={guardando}
              style={ESTILO_CAMPO}
            />
          </label>

          {error && <p className="ts-modal-error" role="alert">{error}</p>}
          {aviso && <p className="ts-success" role="status">{aviso}</p>}

          <div className="ts-btn-group">
            <button
              type="submit"
              className="ts-btn ts-btn-primary"
              disabled={guardando || materiales.length === 0}
            >
              {guardando ? "Registrando…" : "Registrar pérdida"}
            </button>
          </div>
        </form>
      ) : (
        <p className="ts-empty">No tienes permiso para registrar pérdidas.</p>
      )}

      {cargando ? (
        <p className="ts-feedback" role="status">Cargando pérdidas…</p>
      ) : errorCarga ? (
        <div className="ts-feedback ts-error" role="alert">
          <p>{errorCarga}</p>
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
        </div>
      ) : (
        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Pérdidas de materia prima registradas en la orden</caption>
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Motivo</th>
                <th scope="col">Autor</th>
                <th scope="col">Fecha</th>
                <th scope="col">Hora</th>
              </tr>
            </thead>
            <tbody>
              {perdidas.map((p) => {
                const { fecha, hora } = mostrarFechaHora(p.fechaHora);
                return (
                  <tr key={p.id}>
                    <td>
                      {p.material?.nombre ?? `Material ${p.materialId}`}
                      {p.material?.codigo && <> <span className="ts-code">({p.material.codigo})</span></>}
                    </td>
                    <td>{formatearCantidad(p.cantidad, p.unidad)}</td>
                    <td>{p.motivo}</td>
                    <td>{autorDe(p, usuario)}</td>
                    <td>{fecha}</td>
                    <td>{hora}</td>
                  </tr>
                );
              })}
              {perdidas.length === 0 && (
                <tr>
                  <td colSpan={6}>Esta orden no tiene pérdidas registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
