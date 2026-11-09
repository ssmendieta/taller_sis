const CAMPOS = [
  ["solicitada", "Solicitada"], ["producida", "Producida"], ["conforme", "Conforme"], ["defectuosa", "Defectuosa"],
  ["reprocesada", "Reprocesada"], ["recuperada", "Recuperada"], ["descartada", "Descartada"],
];

export function fechaCalendario(fecha) {
  if (!fecha) return "—";
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

function Producto({ producto }) {
  return <>{producto?.codigo ?? "Sin código"} · {producto?.nombre ?? "Sin nombre"}
    {producto?.recetaId != null && <small style={{ display: "block" }}>Receta #{producto.recetaId}</small>}</>;
}

function Materiales({ items }) {
  if (!items.length) return "Sin registros";
  return <ul style={{ paddingLeft: 16, margin: 0 }}>{items.map((item, indice) => (
    <li key={`${item.materialId}-${item.unidad}-${indice}`}>
      Material #{item.materialId}: <span style={{ whiteSpace: "nowrap" }}>{item.cantidad} {item.unidad}</span>
    </li>
  ))}</ul>;
}

function TablaMateriales({ titulo, items }) {
  return <section className="ts-panel">
    <div className="ts-panel-title"><h2>{titulo}</h2></div>
    {!items.length ? <p className="ts-empty">Sin registros.</p> : <div className="ts-table-wrap" tabIndex={0} role="region" aria-label={titulo}>
      <table className="ts-table"><caption>{titulo}</caption>
        <thead><tr><th scope="col">Material ID</th><th scope="col">Unidad</th><th scope="col" className="ts-num">Cantidad</th></tr></thead>
        <tbody>{items.map((item, indice) => <tr key={`${item.materialId}-${item.unidad}-${indice}`}>
          <td>{item.materialId}</td><td>{item.unidad}</td><td className="ts-num">{item.cantidad}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

function Cantidades({ cantidades }) {
  return CAMPOS.map(([campo]) => <td className="ts-num" style={{ whiteSpace: "nowrap" }} key={campo}>{cantidades[campo]}</td>);
}
function CabecerasCantidades() {
  return CAMPOS.map(([campo, titulo]) => <th scope="col" className="ts-num" key={campo}>{titulo}</th>);
}

// Solo se muestran cantidades y grupos calculados por el servidor.
export default function VistaPreviaReporteProduccion({ reporte }) {
  const { filtros, ordenes, totales } = reporte;
  return <>
    <section className="ts-panel" aria-label="Reporte consultado">
      <div className="ts-panel-title"><h2>Vista previa</h2><span>{totales.ordenes} órdenes</span></div>
      <p style={{ padding: "0 20px" }}>Filtros del reporte mostrado: desde {fechaCalendario(filtros.fechaDesde)} hasta {fechaCalendario(filtros.fechaHasta)};
        producto: {filtros.producto ?? "Todos"}. Los extremos del período son inclusivos.</p>
      {!ordenes.length ? <p className="ts-empty">No hay órdenes que cumplan los filtros consultados.</p> :
        <div className="ts-table-wrap" tabIndex={0} role="region" aria-label="Detalle del reporte; desplaza horizontalmente para ver todas las columnas">
          <table className="ts-table"><caption>Detalle por orden de producción</caption>
            <thead><tr><th scope="col">Código</th><th scope="col">Producto</th><th scope="col">Fecha programada</th><th scope="col">Unidad</th>
              <CabecerasCantidades /><th scope="col">Fuente principal y consumos</th><th scope="col">Consumos por material</th><th scope="col">Pérdidas por material (actuales)</th></tr></thead>
            <tbody>{ordenes.map((orden) => <tr key={orden.ordenId}>
              <th scope="row">{orden.codigo}</th><td><Producto producto={orden.producto} /></td>
              <td style={{ whiteSpace: "nowrap" }}>{fechaCalendario(orden.fechaProgramada)}</td><td>{orden.producto?.unidad ?? "Sin unidad"}</td>
              <Cantidades cantidades={orden.cantidades} />
              <td>{orden.fuente === "CIERRE" ? `Cierre v${orden.cierre?.version} · ID ${orden.cierre?.id}` : "Registros actuales"}</td>
              <td><Materiales items={orden.consumos} /></td><td><Materiales items={orden.perdidas} /></td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
    <section className="ts-panel">
      <div className="ts-panel-title"><h2>Totales por producto y unidad</h2></div>
      {!totales.productos.length ? <p className="ts-empty">Sin totales de producto.</p> :
        <div className="ts-table-wrap" tabIndex={0} role="region" aria-label="Totales por producto y unidad">
          <table className="ts-table"><caption>Totales por producto y unidad devueltos por el servidor</caption>
            <thead><tr><th scope="col">Producto</th><th scope="col">Unidad</th><CabecerasCantidades /></tr></thead>
            <tbody>{totales.productos.map((grupo, indice) => <tr key={indice}>
              <td><Producto producto={grupo.producto} /></td><td>{grupo.producto?.unidad ?? "Sin unidad"}</td><Cantidades cantidades={grupo.cantidades} />
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
    <TablaMateriales titulo="Consumos totales por material y unidad" items={totales.consumos} />
    <TablaMateriales titulo="Pérdidas totales por material y unidad (actuales)" items={totales.perdidas} />
  </>;
}
