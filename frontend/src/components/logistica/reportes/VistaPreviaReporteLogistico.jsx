import { ESTADOS_RUTA } from "../../../services/historialLogisticoService.js";
import { ESTADOS_BOLETA_REPORTE } from "../../../services/reportesLogisticosService.js";

const fechaHoraBolivia = new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", dateStyle: "medium", timeStyle: "short" });
const fechaCalendario = (fecha) => fecha.split("-").reverse().join("/");
const estadoRuta = (estado) => ESTADOS_RUTA[estado]?.texto ?? estado;
const estadoBoleta = (estado) => ESTADOS_BOLETA_REPORTE[estado] ?? estado;

function TablaRutas({ rutas }) {
  return <section className="ts-panel" aria-labelledby="reporte-rutas-titulo">
    <div className="ts-panel-title"><h2 id="reporte-rutas-titulo">Rutas</h2></div>
    {!rutas.length ? <p className="ts-empty">No hay rutas que coincidan con los filtros.</p> :
      <div className="ts-table-wrap" role="region" aria-labelledby="reporte-rutas-titulo" tabIndex={0}>
        <table className="ts-table">
          <thead><tr>
            <th scope="col">Ruta</th><th scope="col">Fecha programada</th><th scope="col">Estado</th>
            <th scope="col">Vehículo</th><th scope="col">Chofer</th><th scope="col">Paradas</th>
            <th scope="col">Boletas</th><th scope="col">Incidencias</th><th scope="col">Reprogramaciones</th>
          </tr></thead>
          <tbody>{rutas.map((ruta) => <tr key={ruta.id}>
            <th scope="row">#{ruta.id}</th><td>{fechaCalendario(ruta.fechaProgramada)}</td><td>{estadoRuta(ruta.estado)}</td>
            <td>{ruta.vehiculoExternoId ?? "—"}</td><td>{ruta.choferExternoId ?? "—"}</td>
            <td>{ruta.paradas.total} total · {ruta.paradas.entregadas} entregadas · {ruta.paradas.pendientes} pendientes · {ruta.paradas.anuladas} anuladas</td>
            <td>{ruta.boletas.total} total · {ruta.boletas.emitidas} emitidas · {ruta.boletas.anuladas} anuladas · {ruta.boletas.entregadas} entregadas</td>
            <td className="ts-num">{ruta.incidencias}</td><td className="ts-num">{ruta.reprogramaciones}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}

function TablaBoletas({ boletas }) {
  return <section className="ts-panel" aria-labelledby="reporte-boletas-titulo">
    <div className="ts-panel-title"><h2 id="reporte-boletas-titulo">Boletas</h2></div>
    {!boletas.length ? <p className="ts-empty">No hay boletas que coincidan con los filtros.</p> :
      <div className="ts-table-wrap" role="region" aria-labelledby="reporte-boletas-titulo" tabIndex={0}>
        <table className="ts-table">
          <thead><tr>
            <th scope="col">Boleta</th><th scope="col">Fecha de creación</th><th scope="col">Estado</th>
            <th scope="col">Orden</th><th scope="col">Ítems</th><th scope="col">Cantidad</th>
            <th scope="col">Unidad</th><th scope="col">Ruta</th><th scope="col">Entregada</th>
          </tr></thead>
          <tbody>{boletas.map((boleta) => <tr key={boleta.id}>
            <th scope="row">{boleta.numero ?? `#${boleta.id}`}</th><td>{fechaCalendario(boleta.fecha)}</td><td>{estadoBoleta(boleta.estado)}</td>
            <td>#{boleta.ordenId}</td><td className="ts-num">{boleta.items}</td><td className="ts-num">{boleta.cantidadTotal}</td>
            <td>{boleta.unidad ?? "Desconocida"}</td>
            <td>{boleta.rutaId ? `#${boleta.rutaId} · ${estadoRuta(boleta.estadoRuta)}` : "Sin ruta"}</td>
            <td>{boleta.entregada ? "Sí" : "No"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}

export default function VistaPreviaReporteLogistico({ reporte }) {
  const { filtros, generadoEn, resumen, rutas, boletas, avisos } = reporte;
  const cantidades = Object.entries(resumen.boletas.cantidadEmitidaPorUnidad);
  const sinResultados = !rutas.length && !boletas.length;
  return <>
    <section className="ts-panel" aria-labelledby="reporte-logistico-vista">
      <div className="ts-panel-title"><h2 id="reporte-logistico-vista">Vista previa</h2></div>
      <div className="reporte-logistico-nota">
        <p>Período del {fechaCalendario(filtros.fechaDesde)} al {fechaCalendario(filtros.fechaHasta)}. Rutas: {estadoRuta(filtros.estadoRuta) || "Todos los estados"}. Boletas: {estadoBoleta(filtros.estadoBoleta) || "Todos los estados"}.</p>
        <p>Generado el <time dateTime={generadoEn}>{fechaHoraBolivia.format(new Date(generadoEn))}</time> (hora de Bolivia).</p>
        {!!avisos.length && <ul aria-label="Avisos del reporte">{avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}</ul>}
        {sinResultados ? <p role="status">No hay rutas ni boletas que coincidan con los filtros.</p> :
          <dl className="reporte-logistico-totales">
            <div><dt>Rutas</dt><dd>{resumen.rutas.total} total</dd><dd>{Object.entries(resumen.rutas.porEstado).map(([estado, total]) => `${estadoRuta(estado)}: ${total}`).join(" · ")}</dd></div>
            <div><dt>Entregas en rutas no canceladas</dt><dd>{resumen.entregas.paradas} paradas · {resumen.entregas.entregadas} entregadas · {resumen.entregas.pendientes} pendientes · {resumen.entregas.anuladas} anuladas</dd><dd>{resumen.entregas.boletasEntregadas} boletas entregadas en las rutas consultadas</dd></div>
            <div><dt>Incidencias y reprogramaciones</dt><dd>{resumen.incidencias.total} incidencias · {resumen.reprogramaciones} reprogramaciones</dd><dd>{Object.entries(resumen.incidencias.porTipo).map(([tipo, total]) => `${tipo.replaceAll("_", " ")}: ${total}`).join(" · ")}</dd></div>
            <div><dt>Boletas del período</dt><dd>{resumen.boletas.total} total · {resumen.boletas.entregadas} entregadas</dd><dd>{Object.entries(resumen.boletas.porEstado).map(([estado, total]) => `${estadoBoleta(estado)}: ${total}`).join(" · ")}</dd></div>
            {!!cantidades.length && <div><dt>Cantidades de boletas emitidas por unidad</dt>{cantidades.map(([unidad, total]) => <dd key={unidad}>{total} {unidad}</dd>)}</div>}
          </dl>}
      </div>
    </section>
    {!sinResultados && <><TablaRutas rutas={rutas} /><TablaBoletas boletas={boletas} /></>}
  </>;
}
