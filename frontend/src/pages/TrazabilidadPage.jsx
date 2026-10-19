import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";
import { consultarTrazabilidad } from "../services/boletasService.js";

function obtenerBoletas() {
  const registros = [];

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
        registros.push(boleta);
      }
    } catch {
      // Ignorar registros dañados de sessionStorage.
    }
  }

  return registros;
}

function mostrar(valor) {
  if (
    valor === null ||
    valor === undefined ||
    String(valor).trim() === ""
  ) {
    return "No registrado";
  }

  return String(valor);
}

function obtenerLote(boleta) {
  return (
    boleta?.loteCodigo ??
    boleta?.lote_codigo ??
    boleta?.loteId ??
    boleta?.lote_id ??
    boleta?.lote ??
    ""
  );
}

export default function TrazabilidadPage() {
  const [searchParams] = useSearchParams();

  const filtroUrl =
    searchParams.get("boletaId") ??
    searchParams.get("loteId") ??
    searchParams.get("ordenId") ??
    searchParams.get("q") ??
    "";

  const [boletas, setBoletas] = useState([]);
  const [seleccionadaId, setSeleccionadaId] = useState("");
  const [busqueda, setBusqueda] = useState(filtroUrl);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  function mensajeError(fallo) {
    if (fallo?.status === 403) return "No tienes permiso para consultar la trazabilidad documental.";
    if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
    return fallo?.message || "No se pudo consultar la trazabilidad documental.";
  }

  async function cargar() {
    setCargando(true);
    setError("");

    const boletaUrl = searchParams.get("boletaId");
    const loteUrl = searchParams.get("loteId");
    const ordenUrl = searchParams.get("ordenId");
    const qUrl = searchParams.get("q");

    const tieneSesion = Boolean(
      sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken")
    );

    let registros = [];
    if (tieneSesion) {
      const criterioBusqueda = busqueda.trim() || qUrl;
      const hayCriterio = Boolean(boletaUrl || loteUrl || ordenUrl || criterioBusqueda);

      if (hayCriterio) {
        try {
          const datosApi = await consultarTrazabilidad({
            boletaId: boletaUrl,
            loteId: loteUrl,
            ordenId: ordenUrl,
            q: criterioBusqueda,
          });
          registros = Array.isArray(datosApi) ? datosApi : [];
        } catch (fallo) {
          setBoletas([]);
          setSeleccionadaId("");
          setError(mensajeError(fallo));
          setCargando(false);
          return;
        }
      } else {
        registros = [];
      }
    } else {
      registros = obtenerBoletas();
    }

    setBoletas(registros);
    setCargando(false);

    const encontrada = registros.find((item) => {
      if (boletaUrl) {
        return String(item.id) === String(boletaUrl);
      }

      if (loteUrl) {
        return String(obtenerLote(item)) === String(loteUrl);
      }

      if (ordenUrl) {
        const ordenAsociada =
          item.ordenId ??
          item.orden_id ??
          item.orden ??
          "";

        return String(ordenAsociada) === String(ordenUrl);
      }

      return false;
    });

    setSeleccionadaId((actual) => {
      if (encontrada) {
        return encontrada.id;
      }

      if (
        actual &&
        registros.some(
          (item) => String(item.id) === String(actual)
        )
      ) {
        return actual;
      }

      return registros[0]?.id ?? "";
    });
  }

  useEffect(() => {
    cargar();
  }, [searchParams]);

  useEffect(() => {
    setBusqueda(filtroUrl);
  }, [filtroUrl]);

  const resultados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    if (!texto) {
      return boletas;
    }

    return boletas.filter((boleta) =>
      [
        boleta.id,
        boleta.numero,
        boleta.solicitudId,
        boleta.orden,
        boleta.ordenId,
        obtenerLote(boleta),
        boleta.destino,
        boleta.naturaleza,
        boleta.estado,
      ]
        .filter(Boolean)
        .some((valor) =>
          String(valor).toLowerCase().includes(texto)
        )
    );
  }, [boletas, busqueda]);

  const boleta =
    boletas.find((item) => item.id === seleccionadaId) ?? null;

  const lote = obtenerLote(boleta);

  return (
    <section
      className="ts-page"
      aria-labelledby="trazabilidad-title"
    >
      <PageHeader
        titulo="Logística"
        conteo="Trazabilidad"
        accion={
          <div className="ts-btn-group">
            <Link
              className="ts-btn"
              to="/logistica/boletas/consulta"
            >
              Consulta de boletas
            </Link>

            <Link
              className="ts-btn"
              to="/logistica/boletas"
            >
              Crear boleta
            </Link>
          </div>
        }
      />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <div>
            <h2 id="trazabilidad-title">
              Trazabilidad documental
            </h2>

            <p>
              Consulta la relación entre solicitud, orden,
              boleta y lote.
            </p>
          </div>

          <strong>{boletas.length}</strong>
        </div>

        <div className="ts-filters">
          <label htmlFor="trazabilidad-busqueda">
            Buscar
            <input
              id="trazabilidad-busqueda"
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
              onKeyDown={(evento) => {
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  cargar();
                }
              }}
              placeholder="Boleta, solicitud, orden o lote"
            />
          </label>

          <label htmlFor="trazabilidad-boleta">
            Boleta
            <select
              id="trazabilidad-boleta"
              value={
                resultados.some(
                  (item) => item.id === seleccionadaId
                )
                  ? seleccionadaId
                  : ""
              }
              onChange={(evento) =>
                setSeleccionadaId(evento.target.value)
              }
            >
              <option value="">
                Seleccionar boleta
              </option>

              {resultados.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {mostrar(item.numero)} -{" "}
                  {mostrar(item.orden)}
                </option>
              ))}
            </select>
          </label>

          <div className="ts-btn-group">
            <button
              type="button"
              className="ts-btn"
              onClick={cargar}
              disabled={cargando}
            >
              {cargando ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="ts-panel"
          style={{ marginTop: "1rem" }}
          role="alert"
        >
          <p className="ts-error" style={{ color: "var(--color-error, #b00020)", margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {!boleta ? (
        <div
          className="ts-panel"
          style={{ marginTop: "1rem" }}
        >
          <p className="ts-empty">
            No hay una boleta seleccionada para mostrar la
            trazabilidad.
          </p>
        </div>
      ) : (
        <>
          <div
            className="ts-panel"
            style={{ marginTop: "1rem" }}
          >
            <div className="ts-panel-title">
              <h3>Cadena documental</h3>
              <span>{mostrar(boleta.estado)}</span>
            </div>

            <div className="ts-filters">
              <div>
                <strong>1. Solicitud de salida</strong>
                <p>{mostrar(boleta.solicitudId)}</p>
              </div>

              <div>
                <strong>2. Orden de producción</strong>
                <p>{mostrar(boleta.orden)}</p>
              </div>

              <div>
                <strong>3. Boleta</strong>
                <p>{mostrar(boleta.numero)}</p>
              </div>

              <div>
                <strong>4. Lote</strong>
                <p>{mostrar(lote)}</p>
              </div>
            </div>
          </div>

          <div
            className="ts-panel"
            style={{ marginTop: "1rem" }}
          >
            <div className="ts-panel-title">
              <h3>Detalle de trazabilidad</h3>
            </div>

            <div className="ts-table-wrap">
              <table className="ts-table">
                <tbody>
                  <tr>
                    <th scope="row">ID de boleta</th>
                    <td className="ts-code">
                      {mostrar(boleta.id)}
                    </td>
                  </tr>

                  <tr>
                    <th scope="row">Número</th>
                    <td>{mostrar(boleta.numero)}</td>
                  </tr>

                  <tr>
                    <th scope="row">Fecha</th>
                    <td>{mostrar(boleta.fecha)}</td>
                  </tr>

                  <tr>
                    <th scope="row">
                      Naturaleza documental
                    </th>
                    <td>
                      {mostrar(boleta.naturaleza)}
                    </td>
                  </tr>

                  <tr>
                    <th scope="row">Orden</th>
                    <td>{mostrar(boleta.orden)}</td>
                  </tr>

                  <tr>
                    <th scope="row">Solicitud</th>
                    <td>
                      {mostrar(boleta.solicitudId)}
                    </td>
                  </tr>

                  <tr>
                    <th scope="row">Destino</th>
                    <td>{mostrar(boleta.destino)}</td>
                  </tr>

                  <tr>
                    <th scope="row">Cantidad</th>
                    <td>
                      {mostrar(boleta.cantidad)}{" "}
                      {boleta.unidad
                        ? boleta.unidad
                        : ""}
                    </td>
                  </tr>

                  <tr>
                    <th scope="row">Lote</th>
                    <td>{mostrar(lote)}</td>
                  </tr>

                  <tr>
                    <th scope="row">Estado</th>
                    <td>{mostrar(boleta.estado)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              className="ts-btn-group"
              style={{ marginTop: "1rem" }}
            >
              <Link
                className="ts-btn"
                to={`/logistica/boletas/${boleta.id}`}
                state={{
                  retornoTrazabilidad: {
                    pathname: "/logistica/trazabilidad",
                    search: busqueda.trim()
                      ? `?q=${encodeURIComponent(busqueda.trim())}`
                      : searchParams.toString()
                        ? `?${searchParams.toString()}`
                        : "",
                  },
                }}
              >
                Ver detalle de boleta
              </Link>

              <Link
                className="ts-btn"
                to="/ordenes"
              >
                Consultar órdenes
              </Link>
            </div>
          </div>

          <div
            className="ts-panel"
            style={{ marginTop: "1rem" }}
          >
            <div className="ts-panel-title">
              <h3>Historial disponible</h3>
            </div>

            {Array.isArray(boleta.historial) &&
            boleta.historial.length > 0 ? (
              <div className="ts-table-wrap">
                <table className="ts-table">
                  <thead>
                    <tr>
                      <th scope="col">Evento</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Fecha</th>
                    </tr>
                  </thead>

                  <tbody>
                    {boleta.historial.map(
                      (evento, indice) => (
                        <tr
                          key={evento.id ?? indice}
                        >
                          <td>
                            {mostrar(
                              evento.evento ??
                                evento.tipo ??
                                "Cambio de estado"
                            )}
                          </td>

                          <td>
                            {mostrar(
                              evento.estado ??
                                evento.nuevo
                            )}
                          </td>

                          <td>
                            {mostrar(
                              evento.fecha ??
                                evento.fechaHora
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ts-empty">
                La boleta no tiene historial adicional
                registrado.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}


