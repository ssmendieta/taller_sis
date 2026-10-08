import { useState } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";

export default function LogisticaPage() {
  const [estado, setEstado] = useState("BORRADOR");
  const [guardado, setGuardado] = useState(false);

  function enviarFormulario(evento) {
    evento.preventDefault();
    setGuardado(true);
  }

  const estados = [
    { valor: "BORRADOR", texto: "Borrador" },
    { valor: "EMITIDA", texto: "Emitida" },
    { valor: "ANULADA", texto: "Anulada" },
  ];

  return (
    <section className="ts-page" aria-labelledby="logistica-title">
      <PageHeader
        titulo="Logística"
        conteo="Solicitudes de salida"
      />

      {guardado && (
        <p className="ts-success" role="status">
          Solicitud registrada correctamente.
        </p>
      )}

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="logistica-title">Formulario de salida</h2>
          <span>ABC-204</span>
        </div>

        <form onSubmit={enviarFormulario}>
          <div className="ts-filters">
            <label>
              Orden de producción *
              <input
                type="text"
                name="orden"
                placeholder="Ej. OP-0001"
                required
              />
            </label>

            <label>
              Material *
              <input
                type="text"
                name="material"
                placeholder="Ingrese el material"
                required
              />
            </label>

            <label>
              Cantidad *
              <input
                type="number"
                name="cantidad"
                min="0"
                step="0.01"
                placeholder="0"
                required
              />
            </label>

            <label>
              Destino
              <input
                type="text"
                name="destino"
                placeholder="Destino de salida"
              />
            </label>
          </div>

          <label>
            Observaciones
            <textarea
              name="observaciones"
              rows="3"
              placeholder="Observaciones de la solicitud"
            />
          </label>

          <div className="ts-panel" style={{ marginTop: "1rem" }}>
            <div className="ts-panel-title">
              <h3>Estado del formulario</h3>

              <select
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value);
                  setGuardado(false);
                }}
              >
                {estados.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.texto}
                  </option>
                ))}
              </select>
            </div>

            <p>
              Estado actual: <strong>{estados.find((e) => e.valor === estado)?.texto}</strong>
            </p>

            <div className="ts-filters">
              {estados.map((item) => (
                <div
                  key={item.valor}
                  style={{
                    padding: "0.75rem",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    background:
                      estado === item.valor ? "#eef6ff" : "#fff",
                  }}
                >
                  <strong>{item.texto}</strong>
                  <p style={{ marginBottom: 0 }}>
                    {estado === item.valor
                      ? "Estado seleccionado"
                      : "Estado disponible"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="ts-panel" style={{ marginTop: "1rem" }}>
            <div className="ts-panel-title">
              <h3>Saldos</h3>
              <span>ABC-210</span>
            </div>

            <div className="ts-filters">
              <div>
                <strong>Saldo para solicitudes</strong>
                <p>Disponible para consulta mediante Logística</p>
                <strong>—</strong>
              </div>

              <div>
                <strong>Saldo para boletas</strong>
                <p>Disponible para consulta mediante Logística</p>
                <strong>—</strong>
              </div>
            </div>

            <p style={{ marginTop: "1rem" }}>
              Los saldos quedarán conectados al servicio de Logística cuando
              esté disponible el endpoint correspondiente.
            </p>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="ts-btn ts-btn-primary">
              Guardar solicitud
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
