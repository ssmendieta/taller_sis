import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { obtenerRankingLogistica } from "../../../services/dashboardLogisticaService.js";

const formato = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });

// Cada columna sabe qué valor muestra y en qué sentido es mejor.
const COLUMNAS = [
  { clave: "puntualidad", titulo: "Entregas a tiempo", mayorEsMejor: true, valor: (f) => f.entregas_a_tiempo.porcentaje,
    texto: (f) => `${formato.format(f.entregas_a_tiempo.porcentaje)}% (${f.entregas_a_tiempo.a_tiempo} de ${f.entregas_a_tiempo.entregadas})` },
  { clave: "incidencias", titulo: "Incidencias por 100 entregas", mayorEsMejor: false, valor: (f) => f.incidencias_ruta.por_100,
    texto: (f) => `${formato.format(f.incidencias_ruta.por_100)} (${f.incidencias_ruta.incidencias} en ${f.incidencias_ruta.entregas})` },
  { clave: "uso", titulo: "Uso de capacidad", mayorEsMejor: true, valor: (f) => f.uso_capacidad.porcentaje,
    texto: (f) => `${formato.format(f.uso_capacidad.porcentaje)}%` },
];

const DIMENSIONES = [
  { clave: "CHOFER", texto: "Por chofer", columna: "Chofer", param: "chofer" },
  { clave: "VEHICULO", texto: "Por vehículo", columna: "Vehículo", param: "vehiculo" },
];

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar el ranking.";
  return fallo?.message || "No se pudo cargar el ranking.";
}

// Mejor y peor de cada columna entre las filas con dato (al menos dos distintos).
export function extremos(filas) {
  return Object.fromEntries(COLUMNAS.map((c) => {
    const valores = filas.map(c.valor).filter((v) => v !== null);
    if (new Set(valores).size < 2) return [c.clave, { mejor: null, peor: null }];
    const [min, max] = [Math.min(...valores), Math.max(...valores)];
    return [c.clave, c.mayorEsMejor ? { mejor: max, peor: min } : { mejor: min, peor: max }];
  }));
}

// ABC-430: comparar choferes o vehículos en puntualidad, incidencias y uso de capacidad.
export default function RankingRecursos({ periodo }) {
  const [dimension, setDimension] = useState("CHOFER");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [orden, setOrden] = useState({ columna: "nombre", ascendente: true });
  const ultima = useRef(0);
  const dim = DIMENSIONES.find((d) => d.clave === dimension);

  async function cargar() {
    const consulta = ++ultima.current;
    setError("");
    try {
      const respuesta = await obtenerRankingLogistica({ dimension, ...periodo });
      if (consulta === ultima.current) setDatos(respuesta);
    } catch (fallo) {
      if (consulta === ultima.current) { setDatos(null); setError(mensajeError(fallo)); }
    }
  }

  useEffect(() => {
    cargar();
    return () => { ultima.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension, periodo.desde, periodo.hasta]);

  const filas = useMemo(() => {
    if (!datos) return [];
    const lista = [...datos.filas];
    const col = COLUMNAS.find((c) => c.clave === orden.columna);
    const dir = orden.ascendente ? 1 : -1;
    // Las filas sin dato quedan siempre al final.
    lista.sort((a, b) => {
      if (!col) return dir * (a.nombre ?? a.id).localeCompare(b.nombre ?? b.id, "es");
      const [va, vb] = [col.valor(a), col.valor(b)];
      if (va === null || vb === null) return (va === null) - (vb === null);
      return dir * (va - vb);
    });
    return lista;
  }, [datos, orden]);
  const marcas = useMemo(() => extremos(datos?.filas ?? []), [datos]);

  function ordenarPor(columna) {
    setOrden((o) => ({ columna, ascendente: o.columna === columna ? !o.ascendente : true }));
  }
  const ariaSort = (columna) => (orden.columna === columna ? (orden.ascendente ? "ascending" : "descending") : "none");
  const encabezado = (columna, titulo, num) => (
    <th scope="col" aria-sort={ariaSort(columna)} className={num ? "ts-num" : undefined}>
      <button type="button" className="dash-orden" onClick={() => ordenarPor(columna)}>
        {titulo}{orden.columna === columna ? (orden.ascendente ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
  const enlace = (f) => {
    const p = new URLSearchParams({ [dim.param]: f.id, ...Object.fromEntries(Object.entries(periodo).filter(([, v]) => v)) });
    return `/logistica/kpis/ENTREGAS_A_TIEMPO?${p}`;
  };

  return (
    <section className="dash-ranking" aria-labelledby="dash-ranking-titulo">
      <div className="dash-ranking-cabecera">
        <h2 id="dash-ranking-titulo">Comparar choferes y vehículos</h2>
        <div className="ts-btn-group" role="group" aria-label="Agrupar por">
          {DIMENSIONES.map((d) => (
            <button key={d.clave} type="button" aria-pressed={dimension === d.clave}
              className={`ts-btn ts-btn--sm${dimension === d.clave ? " ts-btn-primary" : ""}`}
              onClick={() => { setDimension(d.clave); setOrden({ columna: "nombre", ascendente: true }); }}>
              {d.texto}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
        </div>
      )}
      {!datos && !error && <p className="ts-empty">Cargando ranking…</p>}
      {datos && filas.length === 0 && <p className="ts-empty">No hay choferes ni vehículos registrados.</p>}
      {datos && filas.length > 0 && (
        <div className="ts-table-wrap">
          <table className="ts-table dash-tabla">
            <caption className="sr-solo">{`KPIs ${dim.texto.toLowerCase()}. Mejor y peor de cada columna marcados con texto.`}</caption>
            <thead>
              <tr>
                {encabezado("nombre", dim.columna)}
                {COLUMNAS.map((c) => <Fragment key={c.clave}>{encabezado(c.clave, c.titulo, true)}</Fragment>)}
                <th scope="col"><span className="sr-solo">Detalle</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <th scope="row">{f.nombre ? `${f.nombre} (${f.id})` : f.id}</th>
                  {f.sin_datos ? (
                    <td colSpan={COLUMNAS.length} className="dash-sin-datos">Sin datos en el período</td>
                  ) : COLUMNAS.map((c) => {
                    const v = c.valor(f);
                    const marca = v === null ? null : v === marcas[c.clave].mejor ? "Mejor" : v === marcas[c.clave].peor ? "Peor" : null;
                    return (
                      <td key={c.clave} className="ts-num" data-marca={marca ?? undefined}>
                        {v === null ? "Sin datos" : c.texto(f)}
                        {marca && <span className={`dash-marca dash-marca--${marca.toLowerCase()}`}>{marca}</span>}
                      </td>
                    );
                  })}
                  <td><Link to={enlace(f)} aria-label={`Ver entregas de ${f.nombre ?? f.id}`}>Ver entregas</Link></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {COLUMNAS.map((c) => {
                  const v = c.valor(datos.totales);
                  return <td key={c.clave} className="ts-num">{v === null ? "Sin datos" : c.texto(datos.totales)}</td>;
                })}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
