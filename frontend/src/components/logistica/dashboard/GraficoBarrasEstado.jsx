import { useState } from "react";

const formato = new Intl.NumberFormat("es-BO");

function porcentaje(valor, total) {
  return total > 0 ? Math.round((valor / total) * 100) : 0;
}

// ABC-330: barras horizontales de conteo por estado. Una sola tonalidad: cada barra
// lleva su nombre y su valor escritos, así la identidad nunca depende del color.
export default function GraficoBarrasEstado({ id, titulo, datos, total, unidad = "registros" }) {
  const [activa, setActiva] = useState(null);
  const [verTabla, setVerTabla] = useState(false);
  const maximo = Math.max(0, ...datos.map((d) => d.valor));
  const resumen = datos.map((d) => `${d.etiqueta}: ${d.valor}`).join(", ");

  return (
    <figure className="dash-grafico" aria-labelledby={`${id}-titulo`}>
      <figcaption className="dash-grafico-cabecera">
        <h3 id={`${id}-titulo`}>{titulo}</h3>
        <span className="dash-grafico-total">{`${formato.format(total)} ${unidad}`}</span>
      </figcaption>

      {total === 0 ? (
        <p className="ts-empty">{`Sin ${unidad} en el período.`}</p>
      ) : verTabla ? (
        <table className="ts-table dash-tabla">
          <caption className="sr-solo">{titulo}</caption>
          <thead>
            <tr><th scope="col">Estado</th><th scope="col" className="ts-num">Cantidad</th><th scope="col" className="ts-num">%</th></tr>
          </thead>
          <tbody>
            {datos.map((d) => (
              <tr key={d.clave}>
                <td>{d.etiqueta}</td>
                <td className="ts-num">{formato.format(d.valor)}</td>
                <td className="ts-num">{`${porcentaje(d.valor, total)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="dash-barras" role="img" aria-label={`${titulo}. ${resumen}.`}>
          {datos.map((d) => {
            const ancho = maximo > 0 ? (d.valor / maximo) * 100 : 0;
            return (
              <li
                key={d.clave}
                className="dash-barra-fila"
                data-activa={activa === d.clave || undefined}
                onMouseEnter={() => setActiva(d.clave)}
                onMouseLeave={() => setActiva(null)}
              >
                <span className="dash-barra-etiqueta">{d.etiqueta}</span>
                <span className="dash-barra-pista">
                  {d.valor > 0 && <span className="dash-barra" style={{ width: `${Math.max(ancho, 1.5)}%` }} />}
                  <span className="dash-barra-valor">{formato.format(d.valor)}</span>
                </span>
                {activa === d.clave && (
                  <span className="dash-tooltip" role="tooltip">
                    {`${d.etiqueta}: ${formato.format(d.valor)} de ${formato.format(total)} (${porcentaje(d.valor, total)}%)`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {total > 0 && (
        <button type="button" className="ts-btn ts-btn--sm dash-ver-tabla" onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? "Ver gráfico" : "Ver tabla"}
        </button>
      )}
    </figure>
  );
}
