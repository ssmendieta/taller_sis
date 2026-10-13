import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";

const ITEMS_POR_PAGINA = 5;

function obtenerBoletas() {
  const boletas = [];

  for (let i = 0; i < sessionStorage.length; i += 1) {
    const clave = sessionStorage.key(i);

    if (!clave || !clave.startsWith("boleta-")) {
      continue;
    }

    try {
      const valor = sessionStorage.getItem(clave);

      if (!valor) {
        continue;
      }

      const boleta = JSON.parse(valor);

      if (boleta && typeof boleta === "object") {
        boletas.push(boleta);
      }
    } catch {
      // Ignorar registros dañados de sessionStorage.
    }
  }

  return boletas;
}

export default function ConsultaBoletasPage() {
  const navigate = useNavigate();

  const [boletas, setBoletas] = useState([]);
  const [numero, setNumero] = useState("");
  const [estado, setEstado] = useState("");
  const [naturaleza, setNaturaleza] = useState("");
  const [pagina, setPagina] = useState(1);

  function cargarBoletas() {
    setBoletas(obtenerBoletas());
    setPagina(1);
  }

  useEffect(() => {
    cargarBoletas();
  }, []);

  const resultados = useMemo(() => {
    return boletas.filter((boleta) => {
      const coincideNumero =
        !numero ||
        String(boleta.numero ?? "")
          .toLowerCase()
          .includes(numero.toLowerCase());

      const coincideEstado =
        !estado || boleta.estado === estado;

      const coincideNaturaleza =
        !naturaleza || boleta.naturaleza === naturaleza;

      return (
        coincideNumero &&
        coincideEstado &&
        coincideNaturaleza
      );
    });
  }, [boletas, numero, estado, naturaleza]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(resultados.length / ITEMS_POR_PAGINA)
  );

  const resultadosPagina = useMemo(() => {
    const inicio = (pagina - 1) * ITEMS_POR_PAGINA;

    return resultados.slice(
      inicio,
      inicio + ITEMS_POR_PAGINA
    );
  }, [resultados, pagina]);

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  function cambiarNumero(evento) {
    setNumero(evento.target.value);
    setPagina(1);
  }

  function cambiarEstado(evento) {
    setEstado(evento.target.value);
    setPagina(1);
  }

  function cambiarNaturaleza(evento) {
    setNaturaleza(evento.target.value);
    setPagina(1);
  }

  function limpiarFiltros() {
    setNumero("");
    setEstado("");
    setNaturaleza("");
    setPagina(1);
  }

  function paginaAnterior() {
    setPagina((actual) => Math.max(1, actual - 1));
  }

  function paginaSiguiente() {
    setPagina((actual) =>
      Math.min(totalPaginas, actual + 1)
    );
  }

  return (
    <section
      className="ts-page"
      aria-labelledby="consulta-boletas-title"
    >
      <PageHeader
        titulo="Boletas"
        conteo="Consulta de boletas"
      />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <div>
            <h2 id="consulta-boletas-title">
              Consulta de boletas
            </h2>

            <p>
              Consulta los documentos de salida registrados.
            </p>
          </div>

          <strong>{resultados.length}</strong>
        </div>

        <div className="ts-filters">
          <label htmlFor="numero-boleta">
            Número de boleta
            <input
              id="numero-boleta"
              type="text"
              value={numero}
              onChange={cambiarNumero}
              placeholder="Ej. BOL-0001"
            />
          </label>

          <label htmlFor="estado-boleta">
            Estado
            <select
              id="estado-boleta"
              value={estado}
              onChange={cambiarEstado}
            >
              <option value="">Todos</option>
              <option value="BORRADOR">Borrador</option>
              <option value="EMITIDA">Emitida</option>
              <option value="ANULADA">Anulada</option>
            </select>
          </label>

          <label htmlFor="naturaleza-boleta">
            Naturaleza documental
            <select
              id="naturaleza-boleta"
              value={naturaleza}
              onChange={cambiarNaturaleza}
            >
              <option value="">Todas</option>
              <option value="TRASLADO">Traslado</option>
              <option value="DESPACHO">Despacho</option>
              <option value="ENTREGA">Entrega</option>
            </select>
          </label>
        </div>

        <div
          className="ts-btn-group"
          style={{ marginTop: "1rem" }}
        >
          <button
            type="button"
            className="ts-btn"
            onClick={limpiarFiltros}
          >
            Limpiar filtros
          </button>

          <button
            type="button"
            className="ts-btn ts-btn-primary"
            onClick={cargarBoletas}
          >
            Actualizar consulta
          </button>
        </div>
      </div>

      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
      >
        <div className="ts-panel-title">
          <h3>Resultados</h3>

          <span>
            {resultados.length} registro(s)
          </span>
        </div>

        {boletas.length === 0 ? (
          <p>
            No hay boletas registradas para mostrar.
          </p>
        ) : resultados.length === 0 ? (
          <p>
            No hay boletas que coincidan con los filtros
            seleccionados.
          </p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="ts-table">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fecha</th>
                    <th>Orden</th>
                    <th>Naturaleza</th>
                    <th>Estado</th>
                    <th>Destino</th>
                    <th>Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {resultadosPagina.map((boleta) => (
                    <tr key={boleta.id}>
                      <td>{boleta.numero ?? "—"}</td>
                      <td>{boleta.fecha ?? "—"}</td>
                      <td>{boleta.orden ?? "—"}</td>
                      <td>{boleta.naturaleza ?? "—"}</td>
                      <td>{boleta.estado ?? "—"}</td>
                      <td>{boleta.destino ?? "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="ts-btn"
                          onClick={() =>
                            navigate(
                              `/logistica/boletas/${boleta.id}`,
                              {
                                state: { boleta },
                              }
                            )
                          }
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className="ts-btn-group"
              style={{
                marginTop: "1rem",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <button
                type="button"
                className="ts-btn"
                onClick={paginaAnterior}
                disabled={pagina === 1}
              >
                Anterior
              </button>

              <span>
                Página {pagina} de {totalPaginas}
              </span>

              <button
                type="button"
                className="ts-btn ts-btn-primary"
                onClick={paginaSiguiente}
                disabled={pagina === totalPaginas}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}