import { useEffect, useMemo, useRef, useState } from "react";
import {
  listarReprocesosOrden,
  registrarReproceso,
} from "../../services/reprocesosService.js";
import { formatearCantidad } from "../../utils/format.js";
import { mostrarFechaHora } from "../../utils/formato.js";

const ESTILO_CAMPO = {
  minHeight: 36,
  padding: "7px 10px",
  border: "1px solid #e0e0e2",
  borderRadius: 5,
};
const ESTILO_ETIQUETA = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 190,
};
const CANTIDAD = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;

function aDiezmilesimas(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 10000) : 0;
}

function autorDe(reproceso, usuario) {
  const id = reproceso.autorUsuarioId ?? reproceso.autor_usuario_id;
  if (id == null) return "—";
  if (usuario?.id != null && String(usuario.id) === String(id)) {
    return usuario.nombre_completo ?? usuario.nombre ?? `Usuario ${id}`;
  }
  return `Usuario ${id}`;
}

function idResultado(resultado) {
  return String(resultado.id ?? resultado.resultadoCalidadId ?? "");
}

function causaDe(resultado) {
  return resultado.causaDefecto ?? resultado.causa_defecto ?? "Sin causa registrada";
}

function validarRespuesta(respuesta) {
  if (!respuesta || !Array.isArray(respuesta.items) || !respuesta.totales) {
    throw new Error("La respuesta de reprocesos no tiene el formato esperado.");
  }
  return respuesta;
}

export default function ReprocesosOrden({
  ordenId,
  defectos,
  unidad,
  permiteRegistrar,
  usuario,
  revisionCalidad,
  onTotalesChange,
}) {
  const [items, setItems] = useState([]);
  const [totales, setTotales] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [resultadoId, setResultadoId] = useState("");
  const [procesada, setProcesada] = useState("");
  const [recuperada, setRecuperada] = useState("");
  const [descartada, setDescartada] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const envioEnCurso = useRef(false);

  const procesadoPorResultado = useMemo(() => {
    const acumulado = new Map();
    items.forEach((item) => {
      const id = String(item.resultadoCalidadId ?? item.resultado_calidad_id ?? "");
      acumulado.set(id, (acumulado.get(id) ?? 0) + aDiezmilesimas(item.cantidadProcesada));
    });
    return acumulado;
  }, [items]);

  const defectosConSaldo = useMemo(
    () => (Array.isArray(defectos) ? defectos : []).map((defecto) => {
      const id = idResultado(defecto);
      const original = aDiezmilesimas(defecto.cantidad);
      const procesado = procesadoPorResultado.get(id) ?? 0;
      return { defecto, id, saldo: Math.max(original - procesado, 0) / 10000 };
    }),
    [defectos, procesadoPorResultado],
  );

  const seleccionado = defectosConSaldo.find((item) => item.id === resultadoId);

  async function cargar({ mostrarCarga = true } = {}) {
    if (mostrarCarga) setCargando(true);
    setErrorCarga("");
    try {
      const respuesta = validarRespuesta(await listarReprocesosOrden(ordenId));
      setItems(respuesta.items);
      setTotales(respuesta.totales);
      onTotalesChange?.(respuesta.totales);
      return respuesta;
    } catch (fallo) {
      setErrorCarga(fallo.message || "No se pudieron cargar los reprocesos de la orden.");
      return null;
    } finally {
      if (mostrarCarga) setCargando(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setTotales(null);
    setResultadoId("");
    onTotalesChange?.(null);
    cargar();
    // revisionCalidad vuelve a consultar cuando cambian los resultados originales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenId, revisionCalidad]);

  async function guardar(evento) {
    evento.preventDefault();
    if (envioEnCurso.current) return;

    setError("");
    setAviso("");

    if (!seleccionado || seleccionado.saldo <= 0) {
      setError("Selecciona un resultado defectuoso con saldo disponible.");
      return;
    }

    if (!CANTIDAD.test(procesada) || aDiezmilesimas(procesada) <= 0) {
      setError("La cantidad procesada debe ser mayor que cero y admitir hasta 4 decimales.");
      return;
    }
    if (!CANTIDAD.test(recuperada) || !CANTIDAD.test(descartada)) {
      setError("Las cantidades recuperada y descartada no pueden ser negativas y admiten hasta 4 decimales.");
      return;
    }

    const unidadesProcesadas = aDiezmilesimas(procesada);
    const unidadesRecuperadas = aDiezmilesimas(recuperada);
    const unidadesDescartadas = aDiezmilesimas(descartada);
    if (unidadesRecuperadas + unidadesDescartadas !== unidadesProcesadas) {
      setError("Las cantidades recuperada y descartada deben sumar la procesada.");
      return;
    }
    if (unidadesProcesadas > aDiezmilesimas(seleccionado.saldo)) {
      setError(`La cantidad procesada supera el saldo disponible de ${formatearCantidad(seleccionado.saldo, unidad)}.`);
      return;
    }

    envioEnCurso.current = true;
    setGuardando(true);
    try {
      await registrarReproceso({
        ordenId,
        resultadoCalidadId: resultadoId,
        cantidadProcesada: Number(procesada),
        cantidadRecuperada: Number(recuperada),
        cantidadDescartada: Number(descartada),
      });
      const respuesta = await cargar({ mostrarCarga: false });
      if (!respuesta) {
        setAviso("Reproceso registrado. No se pudo actualizar el historial; usa Reintentar.");
        return;
      }
      setProcesada("");
      setRecuperada("");
      setDescartada("");
      setAviso("Reproceso registrado correctamente.");
    } catch (fallo) {
      setError(fallo.message || "No se pudo registrar el reproceso.");
      if (fallo.status === 409) await cargar({ mostrarCarga: false });
    } finally {
      envioEnCurso.current = false;
      setGuardando(false);
    }
  }

  return (
    <div className="ts-panel" style={{ marginBottom: 16 }}>
      <div className="ts-panel-title">
        <h2>Reprocesos de unidades defectuosas</h2>
        <span>{items.length} registros</span>
      </div>

      <p className="ts-field-help" role="note" style={{ padding: "0 20px" }}>
        Registra el resultado de volver a procesar unidades defectuosas. Las recuperadas
        pasan al saldo conforme y las descartadas no aumentan la producción.
      </p>

      {totales && (
        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Saldos vigentes después de los reprocesos</caption>
            <thead>
              <tr>
                <th scope="col">Conformes</th>
                <th scope="col">Defectuosas</th>
                <th scope="col">Procesadas</th>
                <th scope="col">Recuperadas</th>
                <th scope="col">Descartadas</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{formatearCantidad(totales.conformes, unidad)}</td>
                <td>{formatearCantidad(totales.defectuosas, unidad)}</td>
                <td>{formatearCantidad(totales.procesadas, unidad)}</td>
                <td>{formatearCantidad(totales.recuperadas, unidad)}</td>
                <td>{formatearCantidad(totales.descartadas, unidad)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {permiteRegistrar ? (
        <form onSubmit={guardar} noValidate style={{ padding: "12px 20px 16px" }}>
          <label htmlFor="reproceso-resultado" style={{ ...ESTILO_ETIQUETA, maxWidth: 560, marginBottom: 12 }}>
            Resultado defectuoso
            <select
              id="reproceso-resultado"
              value={resultadoId}
              onChange={(e) => setResultadoId(e.target.value)}
              disabled={guardando}
              style={ESTILO_CAMPO}
            >
              <option value="">Selecciona un resultado con saldo</option>
              {defectosConSaldo.filter((item) => item.saldo > 0).map((item) => (
                <option key={item.id} value={item.id}>
                  {causaDe(item.defecto)} — saldo {formatearCantidad(item.saldo, unidad)}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
            <label htmlFor="reproceso-procesada" style={ESTILO_ETIQUETA}>
              Cantidad procesada{unidad ? ` (${unidad})` : ""}
              <input id="reproceso-procesada" type="number" min="0.0001" max="9999999999.9999"
                step="0.0001" value={procesada} onChange={(e) => setProcesada(e.target.value)}
                disabled={guardando} style={ESTILO_CAMPO} />
            </label>
            <label htmlFor="reproceso-recuperada" style={ESTILO_ETIQUETA}>
              Cantidad recuperada{unidad ? ` (${unidad})` : ""}
              <input id="reproceso-recuperada" type="number" min="0" max="9999999999.9999"
                step="0.0001" value={recuperada} onChange={(e) => setRecuperada(e.target.value)}
                disabled={guardando} style={ESTILO_CAMPO} />
            </label>
            <label htmlFor="reproceso-descartada" style={ESTILO_ETIQUETA}>
              Cantidad descartada{unidad ? ` (${unidad})` : ""}
              <input id="reproceso-descartada" type="number" min="0" max="9999999999.9999"
                step="0.0001" value={descartada} onChange={(e) => setDescartada(e.target.value)}
                disabled={guardando} style={ESTILO_CAMPO} />
            </label>
          </div>

          {defectosConSaldo.length > 0 && defectosConSaldo.every((item) => item.saldo <= 0) && (
            <p className="ts-field-help" role="note">Todos los resultados defectuosos ya fueron reprocesados.</p>
          )}
          {error && <p className="ts-modal-error" role="alert">{error}</p>}
          {aviso && <p className="ts-success" role="status">{aviso}</p>}

          <div className="ts-btn-group" style={{ marginTop: 12 }}>
            <button type="submit" className="ts-btn ts-btn-primary"
              disabled={guardando || !defectosConSaldo.some((item) => item.saldo > 0)}>
              {guardando ? "Registrando…" : "Registrar reproceso"}
            </button>
          </div>
        </form>
      ) : (
        <p className="ts-empty">No tienes permiso para registrar reprocesos.</p>
      )}

      {cargando ? (
        <p className="ts-feedback" role="status">Cargando reprocesos…</p>
      ) : errorCarga ? (
        <div className="ts-feedback ts-error" role="alert">
          <p>{errorCarga}</p>
          <button type="button" className="ts-btn" onClick={() => cargar()}>Reintentar</button>
        </div>
      ) : (
        <>
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Saldo disponible por resultado defectuoso</caption>
              <thead>
                <tr>
                  <th scope="col">Causa</th>
                  <th scope="col">Cantidad original</th>
                  <th scope="col">Procesada</th>
                  <th scope="col">Saldo disponible</th>
                </tr>
              </thead>
              <tbody>
                {defectosConSaldo.map((item) => (
                  <tr key={item.id}>
                    <td>{causaDe(item.defecto)}</td>
                    <td>{formatearCantidad(item.defecto.cantidad, unidad)}</td>
                    <td>{formatearCantidad((procesadoPorResultado.get(item.id) ?? 0) / 10000, unidad)}</td>
                    <td><strong>{formatearCantidad(item.saldo, unidad)}</strong></td>
                  </tr>
                ))}
                {defectosConSaldo.length === 0 && (
                  <tr><td colSpan={4}>Esta orden no tiene resultados defectuosos para reprocesar.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Historial de reprocesos de la orden</caption>
              <thead>
                <tr>
                  <th scope="col">Resultado</th>
                  <th scope="col">Procesadas</th>
                  <th scope="col">Recuperadas</th>
                  <th scope="col">Descartadas</th>
                  <th scope="col">Autor</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Hora</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const { fecha, hora } = mostrarFechaHora(item.fechaHora ?? item.fecha_hora);
                  return (
                    <tr key={item.id}>
                      <td className="ts-code">#{item.resultadoCalidadId ?? item.resultado_calidad_id}</td>
                      <td>{formatearCantidad(item.cantidadProcesada, unidad)}</td>
                      <td>{formatearCantidad(item.cantidadRecuperada, unidad)}</td>
                      <td>{formatearCantidad(item.cantidadDescartada, unidad)}</td>
                      <td>{autorDe(item, usuario)}</td>
                      <td>{fecha}</td>
                      <td>{hora}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={7}>Esta orden todavía no tiene reprocesos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
