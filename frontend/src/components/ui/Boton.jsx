// Botón compartido del sistema. Una sola convención visual (ts-btn).
// variant: primary | secondary | danger | quiet
// size: md (36px) | sm (32px, tablas)
export default function Boton({
  variant = "secondary",
  size = "md",
  cargando = false,
  textoCargando = "Guardando…",
  children,
  className = "",
  disabled,
  type = "button",
  ...resto
}) {
  const variante = variant === "primary" ? "ts-btn-primary" : variant === "danger" ? "ts-btn-danger" : variant === "quiet" ? "ts-btn-quiet" : "";
  const tam = size === "sm" ? "ts-btn--sm" : "";
  return (
    <button
      type={type}
      className={`ts-btn ${variante} ${tam} ${className}`.trim().replace(/\s+/g, " ")}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...resto}
    >
      {cargando ? textoCargando : children}
    </button>
  );
}
