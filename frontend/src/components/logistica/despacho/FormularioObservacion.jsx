import { useRef, useState } from "react";
import { MAX_OBSERVACION_RUTA } from "../../../services/logisticaService.js";

// ABC-377: observación opcional y botón de confirmación. El botón se desactiva
// mientras se envía y la referencia bloquea un segundo clic antes de que React
// vuelva a pintar, así una acción no se envía dos veces.
export default function FormularioObservacion({ id, etiqueta, accion, accionEnCurso, ayuda, onEnviar, onCancelar }) {
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);

  async function enviar(evento) {
    evento.preventDefault();
    if (enCurso.current) return;
    enCurso.current = true;
    setEnviando(true);
    try {
      await onEnviar(observacion);
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  return (
    <form className="despacho-formulario" onSubmit={enviar} aria-busy={enviando}>
      <div className="ts-field">
        <label htmlFor={id}>{etiqueta} <span className="despacho-opcional">(opcional)</span></label>
        <textarea id={id} rows={2} maxLength={MAX_OBSERVACION_RUTA} value={observacion} disabled={enviando}
          onChange={(evento) => setObservacion(evento.target.value)} />
        <p className="ts-field-help">
          {ayuda ? `${ayuda} ` : ""}{observacion.length}/{MAX_OBSERVACION_RUTA} caracteres.
        </p>
      </div>
      <div className="ts-btn-group">
        <button type="submit" className="ts-btn ts-btn-primary" disabled={enviando}>
          {enviando ? accionEnCurso : accion}
        </button>
        {onCancelar && (
          <button type="button" className="ts-btn" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        )}
      </div>
    </form>
  );
}
