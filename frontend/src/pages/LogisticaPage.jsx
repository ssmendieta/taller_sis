import { useState } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";

export default function LogisticaPage() {
  const [estado, setEstado] = useState("BORRADOR");
  const [guardado, setGuardado] = useState(false);

  function enviarFormulario(evento) {
    evento.preventDefault();
    setGuardado(true);
  }

  return (
    <section className="ts-page" aria-labelledby="logistica-title">
      <PageHeader
        titulo="Logística"
        conteo="Solicitudes de salida"
      />

      {guardado && (
        <p className="ts-success" role="status">
          Solicitud preparada correctamente. Estado actual: {estado}.
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
              Orden de producción
              <input
                type="text"
                name="orden"
                placeholder="Ej. OP-0001"
                required
              />
            </label>

            <label>
              Material
              <input
                type="text"
                name="material"
                placeholder="Ingrese el material"
                required
              />
            </label>

            <label>
              Cantidad
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
              <h3>Estado de la solicitud</h3>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                <option value="BORRADOR">Borrador</option>
                <option value="EMITIDA">Emitida</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </div>

            <p>
              Estado actual: <strong>{estado}</strong>
            </p>
          </div>

          <div className="ts-panel" style={{ marginTop: "1rem" }}>
            <div className="ts-panel-title">
              <h3>Saldos</h3>
            </div>

            <div className="ts-filters">
              <div>
                <strong>Saldo para solicitudes</strong>
                <p>— Pendiente de consulta al servicio de Logística</p>
              </div>

              <div>
                <strong>Saldo para boletas</strong>
                <p>— Pendiente de consulta al servicio de Logística</p>
              </div>
            </div>
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
