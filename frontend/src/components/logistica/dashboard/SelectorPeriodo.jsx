import { useState } from "react";

const diaIso = (fecha) => fecha.toISOString().slice(0, 10);

export function periodoUltimosDias(dias, hoy = new Date()) {
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - (dias - 1));
  return { desde: diaIso(desde), hasta: diaIso(hoy) };
}

export const PERIODO_TODO = { desde: "", hasta: "" };

const ATAJOS = [
  { clave: "7", texto: "Últimos 7 días", periodo: () => periodoUltimosDias(7) },
  { clave: "30", texto: "Últimos 30 días", periodo: () => periodoUltimosDias(30) },
  { clave: "todo", texto: "Todo", periodo: () => PERIODO_TODO },
];

// ABC-330: selector de período en una fila, encima de los widgets.
export default function SelectorPeriodo({ periodo, alCambiar, deshabilitado }) {
  const [desde, setDesde] = useState(periodo.desde);
  const [hasta, setHasta] = useState(periodo.hasta);
  const [error, setError] = useState("");

  function elegir(nuevo) {
    setDesde(nuevo.desde);
    setHasta(nuevo.hasta);
    setError("");
    alCambiar(nuevo);
  }

  function aplicar(evento) {
    evento.preventDefault();
    if (desde && hasta && desde > hasta) {
      setError("La fecha desde no puede ser posterior a la fecha hasta.");
      return;
    }
    setError("");
    alCambiar({ desde, hasta });
  }

  const activo = ATAJOS.find((a) => {
    const p = a.periodo();
    return p.desde === periodo.desde && p.hasta === periodo.hasta;
  })?.clave;

  return (
    <form className="dash-periodo" onSubmit={aplicar} aria-label="Período del tablero">
      <div className="ts-btn-group" role="group" aria-label="Períodos rápidos">
        {ATAJOS.map((a) => (
          <button
            key={a.clave}
            type="button"
            className={`ts-btn ts-btn--sm${activo === a.clave ? " ts-btn-primary" : ""}`}
            aria-pressed={activo === a.clave}
            disabled={deshabilitado}
            onClick={() => elegir(a.periodo())}
          >
            {a.texto}
          </button>
        ))}
      </div>
      <label htmlFor="dash-desde">Desde
        <input id="dash-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </label>
      <label htmlFor="dash-hasta">Hasta
        <input id="dash-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </label>
      <button type="submit" className="ts-btn ts-btn--sm" disabled={deshabilitado}>Aplicar</button>
      {error && <p className="ts-modal-error" role="alert">{error}</p>}
    </form>
  );
}
