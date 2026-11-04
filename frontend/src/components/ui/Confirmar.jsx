// Modal de confirmación único. Título claro, una frase con la
// consecuencia, botón peligro con el verbo (nunca "Sí"/"No").
// Pie: Cancelar (secundario) a la izquierda de la acción principal.
import Boton from "./Boton.jsx";

export default function Confirmar({
  titulo,
  mensaje,
  verbo = "Confirmar",
  peligro = true,
  cargando = false,
  alCancelar,
  alConfirmar,
}) {
  return (
    <div className="ts-modal-overlay">
      <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="confirmar-titulo">
        <h2 id="confirmar-titulo">{titulo}</h2>
        <p>{mensaje}</p>
        <div className="ts-modal-actions">
          <Boton onClick={alCancelar} disabled={cargando}>Cancelar</Boton>
          <Boton variant={peligro ? "danger" : "primary"} cargando={cargando} textoCargando="Guardando…" onClick={alConfirmar}>
            {verbo}
          </Boton>
        </div>
      </div>
    </div>
  );
}
