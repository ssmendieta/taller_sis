export default function FiltrosReporteProduccion({ filtros, alCambiar, alAplicar, alLimpiar, error }) {
  const cambiar = (campo) => (evento) => alCambiar({ ...filtros, [campo]: evento.target.value });
  return (
    <form onSubmit={(evento) => { evento.preventDefault(); alAplicar(); }} aria-label="Filtros del reporte de producción" noValidate>
      <div className="ts-filters">
        <label htmlFor="reporte-desde">Desde
          <input id="reporte-desde" type="date" value={filtros.fechaDesde} onChange={cambiar("fechaDesde")} min="0001-01-01" max="9999-12-31" />
        </label>
        <label htmlFor="reporte-hasta">Hasta
          <input id="reporte-hasta" type="date" value={filtros.fechaHasta} onChange={cambiar("fechaHasta")} min="0001-01-01" max="9999-12-31" />
        </label>
        <label htmlFor="reporte-producto">Producto
          <input id="reporte-producto" type="text" value={filtros.producto} onChange={cambiar("producto")} maxLength={150} placeholder="Código o nombre" />
        </label>
        <div className="ts-btn-group">
          <button type="submit" className="ts-btn ts-btn-primary">Consultar reporte</button>
          <button type="button" className="ts-btn" onClick={alLimpiar}>Limpiar filtros</button>
        </div>
      </div>
      {error && <p className="ts-modal-error" role="alert" style={{ padding: "0 20px 12px" }}>{error}</p>}
    </form>
  );
}
