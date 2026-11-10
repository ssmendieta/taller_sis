import { useEffect, useState } from "react";
import { agruparSolicitudes, deshacerAgrupacion, listarAgrupaciones } from "../../services/logisticaService.js";

const SIN_DATOS = { fechaRequerida: "", tipoCarga: "" };
const ESTADOS = ["BORRADOR", "PREPARADA"];
const MAX_SOLICITUDES = 20;
const MOTIVOS = {
  DESTINO_DISTINTO: "destino distinto",
  FECHA_DISTINTA: "fecha requerida distinta",
  TIPO_CARGA_DISTINTO: "tipo de carga distinto",
  UNIDAD_CARGA_DISTINTA: "unidad de carga distinta",
  ESTADO_NO_AGRUPABLE: "estado incompatible",
  DATOS_INCOMPLETOS: "datos incompletos",
  SOLICITUD_DUPLICADA: "solicitud repetida",
};

export default function AgrupacionSolicitudes({ solicitudes, puedeAgrupar, puedeDeshacer }) {
  const [grupos, setGrupos] = useState(null);
  const [seleccion, setSeleccion] = useState({});
  const [errorListado, setErrorListado] = useState("");
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    listarAgrupaciones({ signal: control.signal })
      .then((datos) => {
        if (!Array.isArray(datos)) throw new Error("Listado de grupos inválido.");
        if (!control.signal.aborted) {
          setGrupos(datos);
          setErrorListado("");
        }
      })
      .catch((fallo) => {
        if (!control.signal.aborted) setErrorListado(fallo.message);
      });
    return () => control.abort();
  }, [intento]);

  const agrupadas = new Set((grupos ?? []).flatMap((grupo) => grupo.solicitudIds));
  const elegibles = solicitudes.filter((fila) => ESTADOS.includes(fila.estado) && !agrupadas.has(String(fila.id)));
  const elegidas = elegibles.filter((fila) => seleccion[fila.id]);
  const puedeEnviar = elegidas.length >= 2 && elegidas.every(({ id }) =>
    seleccion[id].fechaRequerida && seleccion[id].tipoCarga.trim(),
  );

  function alternar(id) {
    setSeleccion((previa) => {
      const actual = { ...previa };
      if (actual[id]) delete actual[id];
      else actual[id] = SIN_DATOS;
      return actual;
    });
  }

  function editar(id, campo, valor) {
    setSeleccion((previa) => ({ ...previa, [id]: { ...previa[id], [campo]: valor } }));
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (ocupado || !puedeEnviar) return;
    setOcupado(true);
    setError(null);
    setMensaje("");
    try {
      const grupo = await agruparSolicitudes(elegidas.map(({ id }) => ({
        solicitudId: String(id),
        ...seleccion[id],
      })));
      setGrupos((previos) => [grupo, ...previos]);
      setSeleccion({});
      setMensaje(`Grupo #${grupo.id} creado.`);
    } catch (fallo) {
      setError(fallo);
    } finally {
      setOcupado(false);
    }
  }

  async function deshacer(id) {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    setMensaje("");
    try {
      await deshacerAgrupacion(id);
      setGrupos((previos) => previos.filter((grupo) => grupo.id !== id));
      setMensaje(`Grupo #${id} deshecho. Las solicitudes están disponibles de nuevo.`);
    } catch (fallo) {
      setError(fallo);
      setIntento((anterior) => anterior + 1);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="ts-panel" aria-labelledby="agrupacion-titulo">
      <div className="ts-panel-title"><h2 id="agrupacion-titulo">Agrupación de solicitudes</h2></div>
      {mensaje && <p role="status">{mensaje}</p>}
      {error && (
        <div role="alert">
          <p>{error.message}</p>
          {!!error.conflictos?.length && <ul>{error.conflictos.map(({ solicitudId, motivo }) => (
            <li key={`${solicitudId}-${motivo}`}>Solicitud #{solicitudId}: {MOTIVOS[motivo] ?? motivo}</li>
          ))}</ul>}
        </div>
      )}
      {errorListado && (
        <p role="alert">{errorListado} <button type="button" className="ts-btn" onClick={() => setIntento((valor) => valor + 1)}>Reintentar</button></p>
      )}
      {!grupos && !errorListado && <p role="status">Cargando agrupaciones…</p>}
      {grupos && <>
        {grupos.length === 0 ? <p>No hay grupos activos.</p> : (
          <ul>{grupos.map((grupo) => (
            <li key={grupo.id}>
              Grupo #{grupo.id} · {grupo.destino} · {grupo.fechaRequerida} · {grupo.tipoCarga} ({grupo.unidadCarga})
              {" · "}Solicitudes {grupo.solicitudIds.join(", ")}
              {grupo.despachado ? " · Despachado" : puedeDeshacer && (
                <>{" "}<button type="button" className="ts-btn" disabled={ocupado} onClick={() => deshacer(grupo.id)}>Deshacer grupo #{grupo.id}</button></>
              )}
            </li>
          ))}</ul>
        )}
        {puedeAgrupar && elegibles.length > 0 && (
          <form onSubmit={guardar}>
            <fieldset disabled={ocupado}>
              <legend>Selecciona de 2 a {MAX_SOLICITUDES} solicitudes y completa sus datos de carga</legend>
              {elegibles.map(({ id, destinoDocumental }) => (
                <div className="solicitudes-salida__fila" key={id}>
                  <label>
                    <input type="checkbox" checked={Boolean(seleccion[id])}
                      disabled={!seleccion[id] && elegidas.length >= MAX_SOLICITUDES} onChange={() => alternar(id)} />
                    Solicitud #{id} · {destinoDocumental}
                  </label>
                  {seleccion[id] && <>
                    <label>Fecha requerida
                      <input type="date" required value={seleccion[id].fechaRequerida}
                        onChange={(evento) => editar(id, "fechaRequerida", evento.target.value)} />
                    </label>
                    <label>Tipo de carga
                      <input type="text" required maxLength={80} value={seleccion[id].tipoCarga}
                        onChange={(evento) => editar(id, "tipoCarga", evento.target.value)} />
                    </label>
                  </>}
                </div>
              ))}
              <button type="submit" className="ts-btn" disabled={!puedeEnviar}>Agrupar solicitudes</button>
            </fieldset>
          </form>
        )}
      </>}
    </section>
  );
}
