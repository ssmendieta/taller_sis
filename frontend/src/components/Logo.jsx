import { NOMBRE_SISTEMA } from "../constants/marca.js";

// Isotipo: módulo (caja) construido que avanza con una ruta/flecha.
// Geométrico, un trazo, sin degradados. Usa currentColor para fondo claro/oscuro.
export default function Logo({ soloIsotipo = false, tamano = 28, className = "" }) {
  const lado = tamano;
  return (
    <span
      className={`marca ${soloIsotipo ? "marca--isotipo" : ""} ${className}`.trim()}
      style={{ display: "inline-flex", alignItems: "center", gap: 9 }}
    >
      <svg
        width={lado}
        height={lado}
        viewBox="0 0 32 32"
        fill="none"
        role="img"
        aria-label={soloIsotipo ? NOMBRE_SISTEMA : undefined}
        aria-hidden={soloIsotipo ? undefined : true}
        style={{ flex: `0 0 ${lado}px`, borderRadius: 8, background: "var(--ts-text)", color: "#fff", padding: 4 }}
      >
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M4 11.5 10.5 8l6.5 3.5L10.5 15 4 11.5Z" />
          <path d="M4 11.5v8L10.5 23l6.5-3.5v-8" />
          <path d="M10.5 15v8" />
          <path d="M19 19h6.5l-2.2-2.2M25.5 19l-2.2 2.2" />
          <path d="M19 24.5h7" strokeWidth="2" />
        </g>
      </svg>
      {!soloIsotipo && (
        <span aria-hidden="true" style={{ fontWeight: 600, fontSize: "0.86rem", letterSpacing: "-0.01em", color: "var(--ts-text)" }}>
          {NOMBRE_SISTEMA}
        </span>
      )}
    </span>
  );
}
