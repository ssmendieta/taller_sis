import { ESTADOS_DEMANDA } from "../../../services/demandasService.js";

function fechaLegible(valor) {
  if (!valor) return "-";
  const [anio, mes, dia] = String(valor).split("T")[0].split("-");
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : valor;
}

function fechaHoraLegible(valor) {
  if (!valor) return "-";
  try {
    const d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor);
    return d.toLocaleString("es-BO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return String(valor);
  }
}

export function BadgeEstadoDemanda({ estado }) {
  const info = ESTADOS_DEMANDA[estado] ?? { texto: estado, clase: "" };
  return <span className={`ts-badge ${info.clase}`}>{info.texto}</span>;
}

export default function TablaDemandas({ demandas }) {
  return (
    <div className="ts-table-wrap">
      <table className="ts-table">
        <caption>Demandas externas ordenadas de la más reciente a la más antigua</caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Origen</th>
            <th scope="col">ID Externo</th>
            <th scope="col">Fecha requerida</th>
            <th scope="col">Estado</th>
            <th scope="col">Productos solicitados</th>
            <th scope="col">Recibida en</th>
            <th scope="col">Confirmada en</th>
          </tr>
        </thead>
        <tbody>
          {demandas.map((demanda) => (
            <tr key={demanda.id}>
              <td>#{demanda.id}</td>
              <td>
                <span className="ts-badge ts-badge--info">{demanda.origen}</span>
              </td>
              <td>
                <strong>{demanda.demandaExternaId}</strong>
              </td>
              <td>{fechaLegible(demanda.fechaRequerida)}</td>
              <td>
                <BadgeEstadoDemanda estado={demanda.estado} />
              </td>
              <td>
                {Array.isArray(demanda.items) && demanda.items.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: "0.875rem" }}>
                    {demanda.items.map((it, idx) => (
                      <li key={it.id || idx}>
                        <code>{it.productoCodigo}</code>: {it.cantidad} {it.unidad}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: "#777" }}>Sin ítems</span>
                )}
              </td>
              <td>{fechaHoraLegible(demanda.recibidaEn)}</td>
              <td>{fechaHoraLegible(demanda.confirmadaEn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
