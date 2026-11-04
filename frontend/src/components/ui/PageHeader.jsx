export default function PageHeader({ titulo, descripcion, conteo, accion }) {
  return (
    <header className="ts-heading">
      <div>
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      <div className="ts-heading-actions">
        {conteo != null && !accion && <span>{conteo}</span>}
        {accion}
      </div>
    </header>
  );
}
