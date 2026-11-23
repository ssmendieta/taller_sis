import { useCallback, useEffect, useRef, useState } from "react";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { NOMBRES_KPI } from "../services/kpis.js";
import { AREAS_METAS, PERMISO_GESTIONAR_METAS, prepararMetaKpi } from "../services/metasKpi.js";
import Boton from "../components/ui/Boton.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import "../styles/metas-kpi.css";

const campos = (meta) => ({ meta: meta.meta ?? "", umbralAmarilloPct: meta.umbralAmarilloPct, umbralRojoPct: meta.umbralRojoPct });
function mensaje(fallo) {
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  if (fallo?.status === 403) return "No tienes permiso para consultar o modificar estas metas.";
  return fallo?.message || "No se pudo completar la operación. Intenta nuevamente.";
}

function EditorMeta({ area, meta }) {
  const [valores, setValores] = useState(() => campos(meta));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const vigente = useRef(true);
  useEffect(() => { vigente.current = true; return () => { vigente.current = false; }; }, []);
  const nombre = NOMBRES_KPI[meta.kpi] ?? meta.kpi;
  const id = `${area}-${meta.kpi}`;
  const cambiar = (campo) => (evento) => {
    setValores((antes) => ({ ...antes, [campo]: evento.target.value }));
    setError(""); setConfirmacion("");
  };
  async function guardar(evento) {
    evento.preventDefault();
    if (guardando) return;
    setError(""); setConfirmacion("");
    let datos;
    try { datos = prepararMetaKpi(valores); } catch (fallo) { setError(fallo.message); return; }
    setGuardando(true);
    try {
      const actualizada = await AREAS_METAS[area].guardar(meta.kpi, datos);
      if (vigente.current) {
        setValores(campos(actualizada));
        setConfirmacion(actualizada.meta === null ? "Meta eliminada. El KPI queda sin semáforo." : "Meta guardada correctamente.");
      }
    } catch (fallo) { if (vigente.current) setError(mensaje(fallo)); }
    finally { if (vigente.current) setGuardando(false); }
  }
  return (
    <form className="ts-metas-card" onSubmit={guardar} aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`}>{nombre}</h3>
      <p>Unidad: {meta.unidad}. {meta.sentido === "MAYOR_ES_MEJOR" ? "Un valor mayor es mejor." : "Un valor menor es mejor."}</p>
      <fieldset disabled={guardando} aria-describedby={`${id}-ayuda`}>
        <legend>Meta y umbrales de {nombre}</legend>
        <label htmlFor={`${id}-meta`}>Meta de {nombre}</label>
        <input id={`${id}-meta`} type="number" step="0.0001" min="0.0001" max="9999999999" value={valores.meta} onChange={cambiar("meta")} />
        <label htmlFor={`${id}-amarillo`}>Umbral amarillo de {nombre} (%)</label>
        <input id={`${id}-amarillo`} type="number" step="0.01" min="0" max="9999.99" required value={valores.umbralAmarilloPct} onChange={cambiar("umbralAmarilloPct")} />
        <label htmlFor={`${id}-rojo`}>Umbral rojo de {nombre} (%)</label>
        <input id={`${id}-rojo`} type="number" step="0.01" min="0" max="9999.99" required value={valores.umbralRojoPct} onChange={cambiar("umbralRojoPct")} />
        <p id={`${id}-ayuda`}>Los umbrales son porcentajes de desviación de la meta; rojo debe superar a amarillo. Deja la meta vacía para quitarla.</p>
        <Boton type="submit" variant="primary" cargando={guardando} aria-label={`Guardar meta de ${nombre}`}>Guardar meta</Boton>
      </fieldset>
      {error && <p className="ts-feedback ts-error" role="alert">{error}</p>}
      {confirmacion && <p role="status">{confirmacion}</p>}
    </form>
  );
}

function MetasArea({ area }) {
  const config = AREAS_METAS[area];
  const [metas, setMetas] = useState(null);
  const [error, setError] = useState("");
  const ultima = useRef(0);
  const cargar = useCallback(async () => {
    const consulta = ++ultima.current;
    setError(""); setMetas(null);
    try {
      const datos = await config.listar();
      if (!Array.isArray(datos)) throw new Error("La respuesta de metas no es válida.");
      if (consulta === ultima.current) setMetas(datos);
    } catch (fallo) { if (consulta === ultima.current) setError(mensaje(fallo)); }
  }, [config]);
  useEffect(() => { cargar(); return () => { ultima.current += 1; }; }, [cargar]);
  return (
    <section aria-labelledby={`metas-${area}`} aria-busy={metas === null && !error}>
      <h2 id={`metas-${area}`}>{config.nombre}</h2>
      {error && <div role="alert" className="ts-feedback ts-error"><p>{error}</p><Boton onClick={cargar} aria-label={`Reintentar ${config.nombre}`}>Reintentar {config.nombre}</Boton></div>}
      {!metas && !error && <p>Cargando metas de {config.nombre}…</p>}
      {metas?.length === 0 && <p>No hay metas configuradas en {config.nombre}.</p>}
      {metas && <div className="ts-metas-grid">{metas.map((meta) => <EditorMeta key={meta.kpi} area={area} meta={meta} />)}</div>}
    </section>
  );
}

export default function MetasKpiPage() {
  const { usuario } = useSesion();
  if (!tienePermiso(usuario, PERMISO_GESTIONAR_METAS)) return <p role="alert">No tienes permiso para configurar metas.</p>;
  return (
    <section className="ts-page ts-metas">
      <PageHeader titulo="Metas de KPI" descripcion="Configura las metas y el semáforo de los indicadores de Producción y Logística." />
      {Object.entries(AREAS_METAS).map(([area, config]) => tienePermiso(usuario, config.permiso)
        ? <MetasArea key={area} area={area} />
        : <p key={area} role="status">No tienes permiso para consultar las metas de {config.nombre}.</p>)}
    </section>
  );
}
