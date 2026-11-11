import { formatearCantidad, formatearEstadoOrden, formatearFechaHora } from "../../../utils/format.js";

const TITULOS = {
  ESTADO: "Estado de la orden",
  AVANCE: "Avance de producción",
  CONFORME: "Resultado conforme",
  DEFECTUOSO: "Resultado defectuoso",
  PERDIDA: "Pérdida de materia prima",
  OBSERVACION: "Observación",
  INCIDENCIA: "Incidencia",
  LOTE: "Lote registrado",
  REPROCESO: "Reproceso",
};

function DetalleEvento({ evento }) {
  const datos = evento.datos;
  switch (evento.tipo) {
    case "ESTADO":
      return <>
        <p>{datos.estadoAnterior ? formatearEstadoOrden(datos.estadoAnterior) : "Inicio"}
          {" → "}{formatearEstadoOrden(datos.estadoNuevo)}</p>
        {datos.motivo && <p>{datos.motivo}</p>}
      </>;
    case "AVANCE":
      return <p>Producción registrada de {formatearCantidad(datos.cantidad, datos.unidad)}.</p>;
    case "CONFORME":
    case "DEFECTUOSO":
      return <>
        <p>Cantidad de {formatearCantidad(datos.cantidad, datos.unidad)}.</p>
        {datos.causaDefecto && <p>{datos.causaDefecto}</p>}
      </>;
    case "PERDIDA":
      return <>
        <p>{datos.materialNombre || `Material #${datos.materialId}`}
          {datos.materialCodigo && ` (${datos.materialCodigo})`}
          {" · "}{formatearCantidad(datos.cantidad, datos.unidad)}</p>
        <p>{datos.motivo}</p>
      </>;
    case "OBSERVACION":
    case "INCIDENCIA":
      return <p>{datos.descripcion}</p>;
    case "LOTE":
      return <p>{datos.codigo} · {formatearCantidad(datos.cantidad, datos.unidad)}</p>;
    case "REPROCESO":
      return <dl>
        <div><dt>Procesado</dt><dd>{formatearCantidad(datos.cantidadProcesada, datos.unidad)}</dd></div>
        <div><dt>Recuperado</dt><dd>{formatearCantidad(datos.cantidadRecuperada, datos.unidad)}</dd></div>
        <div><dt>Descartado</dt><dd>{formatearCantidad(datos.cantidadDescartada, datos.unidad)}</dd></div>
      </dl>;
    default:
      return null;
  }
}

export default function CronologiaOrden({ eventos }) {
  if (!eventos.length) {
    return <p className="ts-empty" role="status">La orden todavía no tiene eventos registrados.</p>;
  }
  return <>
    <p>{eventos.length} eventos · Del más antiguo al más reciente</p>
    <ol className="cronologia-orden" aria-label="Eventos de la orden">
      {eventos.map((evento) => {
        const { fecha, hora } = formatearFechaHora(evento.fechaHora);
        return <li key={evento.clave}>
          <article>
            <header>
              <h2>{TITULOS[evento.tipo]}</h2>
              <time dateTime={evento.fechaHora}>{fecha} · {hora}</time>
            </header>
            <DetalleEvento evento={evento} />
            <p className="cronologia-orden__autor">{evento.usuarioNombre}</p>
          </article>
        </li>;
      })}
    </ol>
  </>;
}
