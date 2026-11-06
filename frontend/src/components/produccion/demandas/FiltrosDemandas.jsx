import { useState } from "react";
import {
  ESTADOS_DEMANDA,
  ORIGENES_DEMANDA,
} from "../../../services/demandasService.js";

export const FILTROS_DEMANDAS_INICIALES = {
  origen: "",
  estado: "",
  limit: 10,
};

export default function FiltrosDemandas({
  iniciales = FILTROS_DEMANDAS_INICIALES,
  alAplicar,
  deshabilitado,
}) {
  const [filtros, setFiltros] = useState(iniciales);

  const cambiar = (campo) => (evento) =>
    setFiltros((actuales) => ({
      ...actuales,
      [campo]: campo === "limit" ? Number(evento.target.value) : evento.target.value,
    }));

  function aplicar(evento) {
    evento.preventDefault();
    alAplicar({ ...filtros });
  }

  function limpiar() {
    setFiltros(FILTROS_DEMANDAS_INICIALES);
    alAplicar(FILTROS_DEMANDAS_INICIALES);
  }

  return (
    <form
      onSubmit={aplicar}
      aria-label="Filtros de demandas recibidas"
      style={{ padding: "12px 20px" }}
    >
      <div className="ts-filters">
        <label htmlFor="filtro-demanda-origen">
          Origen
          <select
            id="filtro-demanda-origen"
            value={filtros.origen}
            onChange={cambiar("origen")}
          >
            <option value="">Todos los orígenes</option>
            {ORIGENES_DEMANDA.map((orig) => (
              <option key={orig} value={orig}>
                {orig}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="filtro-demanda-estado">
          Estado
          <select
            id="filtro-demanda-estado"
            value={filtros.estado}
            onChange={cambiar("estado")}
          >
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_DEMANDA).map(([valor, { texto }]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="filtro-demanda-limite">
          Registros por página
          <select
            id="filtro-demanda-limite"
            value={filtros.limit}
            onChange={cambiar("limit")}
          >
            {[5, 10, 20].map((cant) => (
              <option key={cant} value={cant}>
                {cant}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ts-btn-group" style={{ marginTop: 12 }}>
        <button
          type="submit"
          className="ts-btn ts-btn-primary"
          disabled={deshabilitado}
        >
          Aplicar filtros
        </button>
        <button
          type="button"
          className="ts-btn"
          onClick={limpiar}
          disabled={deshabilitado}
        >
          Limpiar filtros
        </button>
      </div>
    </form>
  );
}
