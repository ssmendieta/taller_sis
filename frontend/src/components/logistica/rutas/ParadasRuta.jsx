// ABC-372: paradas de la ruta, cada una con su destino y las boletas emitidas que entrega.
// Una boleta solo puede estar en una parada de la ruta.
export default function ParadasRuta({ paradas, boletas, cargandoBoletas, onCambiarDestino, onAlternarBoleta, onAgregar, onQuitar }) {
  const usadas = new Map();
  paradas.forEach((parada) => parada.boletaIds.forEach((id) => usadas.set(id, parada.clave)));

  return (
    <div className="ts-panel">
      <div className="ts-panel-title">
        <h2>Paradas</h2>
        <button type="button" className="ts-btn" onClick={onAgregar}>Agregar parada</button>
      </div>
      {cargandoBoletas && <p className="ts-notice" role="status">Cargando boletas emitidas…</p>}
      {paradas.length === 0 ? (
        <p className="ts-empty">Aún no hay paradas. Agrega al menos una con su destino y sus boletas.</p>
      ) : (
        <ol className="rutas-paradas">
          {paradas.map((parada, indice) => (
            <li key={parada.clave} className="rutas-parada" aria-label={`Parada ${indice + 1}`}>
              <div className="rutas-parada-cabecera">
                <label htmlFor={`parada-destino-${parada.clave}`}>Destino de la parada {indice + 1}
                  <input id={`parada-destino-${parada.clave}`} type="text" maxLength={250} value={parada.destino}
                    placeholder="Ej. Tienda Central"
                    onChange={(evento) => onCambiarDestino(parada.clave, evento.target.value)} />
                </label>
                <button type="button" className="ts-btn ts-btn--sm" aria-label={`Quitar parada ${indice + 1}`}
                  onClick={() => onQuitar(parada.clave)}>Quitar</button>
              </div>
              {boletas.length === 0 ? (
                <p className="ts-empty">No hay boletas emitidas para asignar.</p>
              ) : (
                <fieldset className="rutas-boletas">
                  <legend>Boletas emitidas ({parada.boletaIds.length} elegidas)</legend>
                  {boletas.map((boleta) => {
                    const enOtra = usadas.has(boleta.id) && usadas.get(boleta.id) !== parada.clave;
                    return (
                      <label key={boleta.id} className={`rutas-boleta${enOtra ? " rutas-boleta--usada" : ""}`}
                        htmlFor={`parada-${parada.clave}-boleta-${boleta.id}`}>
                        <input id={`parada-${parada.clave}-boleta-${boleta.id}`} type="checkbox"
                          checked={parada.boletaIds.includes(boleta.id)} disabled={enOtra}
                          title={enOtra ? "Ya está en otra parada de esta ruta" : undefined}
                          onChange={() => onAlternarBoleta(parada.clave, boleta.id)} />
                        <span className="ts-code">{boleta.numero}</span>
                        <span>{[boleta.productoCodigo, boleta.unidad].filter(Boolean).join(" · ") || "—"}</span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
