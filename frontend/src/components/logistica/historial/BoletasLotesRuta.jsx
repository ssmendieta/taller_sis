import { Link } from "react-router-dom";

const ESTADOS_BOLETA = {
  BORRADOR: { texto: "Borrador", clase: "ts-badge--PLANIFICADA" },
  EMITIDA: { texto: "Emitida", clase: "ts-badge--FINALIZADA" },
  ANULADA: { texto: "Anulada", clase: "ts-badge--CANCELADA" },
};

export function etiquetaBoleta(boleta) {
  return boleta.numero || `Boleta ${boleta.id}`;
}

function BadgeBoleta({ estado }) {
  const info = ESTADOS_BOLETA[estado] ?? { texto: estado, clase: "" };
  return <span className={`ts-badge ${info.clase}`}>{info.texto}</span>;
}

// Los enlaces a boletas y a la trazabilidad de lotes solo se ofrecen con permiso de consulta de boletas.
function EnlaceBoleta({ boleta, puedeVerBoletas }) {
  return puedeVerBoletas
    ? <Link to={`/logistica/boletas/${boleta.id}`}>{etiquetaBoleta(boleta)}</Link>
    : etiquetaBoleta(boleta);
}

// ABC-393: boletas y lotes que viajan en la ruta, de solo lectura.
export default function BoletasLotesRuta({ detalle, puedeVerBoletas }) {
  const filas = detalle.paradas.flatMap((parada) => parada.boletas.map((boleta) => ({ parada, boleta })));
  if (filas.length === 0) return <p className="ts-empty">La ruta no tiene boletas asignadas.</p>;

  return (
    <>
      <div className="ts-table-wrap">
        <table className="ts-table">
          <caption>Boletas de la ruta con los lotes que contienen</caption>
          <thead>
            <tr>
              <th scope="col">Parada</th>
              <th scope="col">Boleta</th>
              <th scope="col">Estado</th>
              <th scope="col">Orden</th>
              <th scope="col">Lotes</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ parada, boleta }) => (
              <tr key={`${parada.id}-${boleta.id}`}>
                <td>{parada.secuencia}. {parada.destino}</td>
                <td><EnlaceBoleta boleta={boleta} puedeVerBoletas={puedeVerBoletas} /></td>
                <td><BadgeBoleta estado={boleta.estado} /></td>
                <td>#{boleta.ordenId}</td>
                <td>
                  {boleta.items.length === 0
                    ? "—"
                    : boleta.items.map((item) => `${item.referencia} × ${Number(item.cantidad)}`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ts-table-wrap">
        <table className="ts-table">
          <caption>Lotes de la ruta; la cantidad vigente no incluye boletas anuladas</caption>
          <thead>
            <tr>
              <th scope="col">Lote</th>
              <th scope="col">Cantidad vigente</th>
              <th scope="col">Boletas</th>
            </tr>
          </thead>
          <tbody>
            {detalle.lotes.map((lote) => (
              <tr key={lote.referencia}>
                <td>
                  {puedeVerBoletas
                    ? <Link to={`/logistica/trazabilidad?loteId=${encodeURIComponent(lote.referencia)}`}>{lote.referencia}</Link>
                    : lote.referencia}
                </td>
                <td>{Number(lote.cantidadVigente)}</td>
                <td>{lote.boletas.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
