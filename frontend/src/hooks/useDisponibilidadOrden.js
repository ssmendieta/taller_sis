import { useEffect, useRef, useState } from "react";
import { obtenerDisponibilidadOrden, solicitarDisponibilidadOrden } from "../services/ordenesService.js";

function falloConsulta(datos, ahora) {
  if (datos?.estado_consulta !== "PENDIENTE") return "";
  if (datos.error_respuesta) return `${datos.error_respuesta}. Puedes reintentar.`;
  if (datos.publicacion?.ultimo_error) {
    return "No se pudo publicar la consulta a Inventarios. El envío sigue pendiente y se reintentará; también puedes reintentar ahora.";
  }
  if (datos.respuesta_esperada_hasta && ahora >= Date.parse(datos.respuesta_esperada_hasta)) {
    return "Inventarios todavía no respondió. Se agotó el tiempo de espera; puedes reintentar la misma consulta.";
  }
  return "";
}

export default function useDisponibilidadOrden(ordenId) {
  const [datos, setDatos] = useState(null);
  const [errorHttp, setErrorHttp] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const contexto = useRef(null);

  useEffect(() => {
    const ctx = { activo: true, id: String(ordenId), secuencia: 0, enviando: false, datos: null, timer: null };
    contexto.current = ctx;
    setDatos(null); setErrorHttp(""); setEnviando(false);

    function aceptar(respuesta) {
      if (String(respuesta?.orden_id) !== ctx.id) throw new Error("La respuesta de disponibilidad no corresponde a esta orden.");
      if (ctx.datos?.consulta_version > respuesta.consulta_version) return;
      if (ctx.datos?.consulta_id === respuesta.consulta_id && ctx.datos?.request_event_id
        && (ctx.datos.request_event_id !== respuesta.request_event_id
          || ctx.datos.correlation_id !== respuesta.correlation_id)) {
        throw new Error("La correlación de la respuesta no coincide con la consulta de disponibilidad.");
      }
      ctx.datos = respuesta;
      ctx.errorHttp = false;
      setDatos(respuesta); setAhora(Date.now()); setErrorHttp("");
    }

    function programar() {
      clearTimeout(ctx.timer);
      if (ctx.activo && ctx.datos?.estado_consulta === "PENDIENTE") {
        ctx.timer = setTimeout(() => void leer(), 1000);
      }
    }

    async function leer() {
      const secuencia = ++ctx.secuencia;
      try {
        const respuesta = await obtenerDisponibilidadOrden(ctx.id);
        if (!ctx.activo || secuencia !== ctx.secuencia) return;
        aceptar(respuesta);
        programar();
      } catch (error) {
        if (ctx.activo && secuencia === ctx.secuencia) {
          ctx.errorHttp = true;
          setErrorHttp(error.message || "No se pudo consultar la disponibilidad.");
        }
      }
    }

    ctx.solicitar = async () => {
      if (!ctx.activo || ctx.enviando
        || (ctx.datos?.estado_consulta === "PENDIENTE" && !ctx.errorHttp && !falloConsulta(ctx.datos, Date.now()))) return;
      ctx.enviando = true;
      ++ctx.secuencia;
      clearTimeout(ctx.timer);
      setEnviando(true); setErrorHttp("");
      try {
        const respuesta = await solicitarDisponibilidadOrden(ctx.id);
        if (!ctx.activo) return;
        aceptar(respuesta);
      } catch (error) {
        if (ctx.activo) { ctx.errorHttp = true; setErrorHttp(error.message || "No se pudo solicitar la disponibilidad."); }
      } finally {
        ctx.enviando = false;
        if (ctx.activo) { setEnviando(false); programar(); }
      }
    };
    void leer();
    return () => { ctx.activo = false; clearTimeout(ctx.timer); };
  }, [ordenId]);

  const error = errorHttp || falloConsulta(datos, ahora);
  const estado = enviando ? "PENDIENTE" : datos?.estado_consulta ?? "SIN_CONSULTA";
  return {
    datos,
    estado,
    error,
    bloqueada: enviando || (estado === "PENDIENTE" && !error),
    aviso: estado === "RESPONDIDA"
      ? "Inventarios respondió. Revisa las cantidades y estados de los materiales."
      : estado === "PENDIENTE" ? "Consulta pendiente. Esperando una respuesta de Inventarios…" : "",
    solicitar: () => contexto.current?.solicitar(),
  };
}
