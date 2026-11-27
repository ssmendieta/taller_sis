import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NOMBRES_KPI, formatearKpi } from "../../services/kpis.js";
import {
  UNIDADES_KPI, cargarAvisos, contarAvisosSinLeer, enlaceDetalle, marcarAvisoLeido,
} from "../../services/avisosKpiService.js";
import { formatearFechaHora } from "../../utils/format.js";
import "../../styles/avisos-kpi.css";

const valor = (aviso, campo) => formatearKpi(aviso[campo], UNIDADES_KPI[aviso.kpi] ?? "%");

// ABC-501: indicador de avisos de KPI en rojo sin leer y su lista.
export default function AvisosKpi({ usuario, onNavegar }) {
  const [sinLeer, setSinLeer] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [avisos, setAvisos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [marcando, setMarcando] = useState(null);

  useEffect(() => {
    contarAvisosSinLeer(usuario).then(setSinLeer).catch(() => setSinLeer(0));
  }, [usuario]);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const lista = await cargarAvisos(usuario);
      setAvisos(lista);
      setSinLeer(lista.filter((aviso) => !aviso.leido).length);
    } catch (fallo) {
      setError(fallo?.message || "No se pudieron cargar los avisos.");
    } finally {
      setCargando(false);
    }
  }

  function alternar() {
    if (!abierto) cargar();
    setAbierto(!abierto);
  }

  async function leer(aviso) {
    const clave = `${aviso.area}-${aviso.id}`;
    if (marcando === clave) return;
    setMarcando(clave);
    setError("");
    try {
      await marcarAvisoLeido(aviso);
      setAvisos((actuales) => actuales.map((a) => (a === aviso ? { ...a, leido: true } : a)));
      setSinLeer((total) => Math.max(total - 1, 0));
    } catch (fallo) {
      setError(fallo?.message || "No se pudo marcar el aviso como leído.");
    } finally {
      setMarcando(null);
    }
  }

  return (
    <div className="avisos-kpi">
      <button type="button" className="avisos-kpi-boton" aria-expanded={abierto} onClick={alternar}
        aria-label={`Avisos de KPI: ${sinLeer} sin leer`}>
        Avisos de KPI
        {sinLeer > 0 && <span className="avisos-kpi-contador">{sinLeer}</span>}
      </button>

      {abierto && (
        <div className="avisos-kpi-panel" role="region" aria-label="Avisos de KPI en rojo">
          {cargando && <p className="avisos-kpi-estado" role="status">Cargando avisos…</p>}
          {error && (
            <div className="avisos-kpi-estado avisos-kpi-error" role="alert">
              <p>{error}</p>
              <button type="button" className="ts-btn ts-btn--sm" onClick={cargar}>Reintentar</button>
            </div>
          )}
          {!cargando && !error && avisos.length === 0 && <p className="avisos-kpi-estado">No hay avisos de KPI en rojo.</p>}
          {!cargando && avisos.length > 0 && (
            <ul className="avisos-kpi-lista">
              {avisos.map((aviso) => {
                const { fecha, hora } = formatearFechaHora(aviso.fecha);
                return (
                  <li key={`${aviso.area}-${aviso.id}`} className="avisos-kpi-item" data-leido={aviso.leido || undefined}>
                    <strong>{NOMBRES_KPI[aviso.kpi] ?? aviso.kpi}</strong>
                    <span>Valor: {valor(aviso, "valor")} · Meta: {aviso.meta === null ? "Sin meta" : valor(aviso, "meta")}</span>
                    <span className="avisos-kpi-fecha">{fecha} {hora}</span>
                    <span className="avisos-kpi-acciones">
                      <Link to={enlaceDetalle(aviso)} onClick={() => { setAbierto(false); onNavegar?.(); }}>Ver detalle</Link>
                      {aviso.leido ? <span>Leído</span> : (
                        <button type="button" className="ts-btn ts-btn--sm" disabled={marcando === `${aviso.area}-${aviso.id}`}
                          onClick={() => leer(aviso)}>Marcar como leído</button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
