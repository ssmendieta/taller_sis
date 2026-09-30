// Paginación cliente compartida (el backend devuelve listas completas).
// Mismo aspecto y vocabulario en todos los listados: Anterior/Siguiente.
export const TAMANO_PAGINA_LISTADOS = 8;

export function paginar(lista, pagina, tamano = TAMANO_PAGINA_LISTADOS) {
  if (!Array.isArray(lista)) return [];
  const actual = Math.max(1, pagina);
  return lista.slice((actual - 1) * tamano, actual * tamano);
}

export function totalPaginas(lista, tamano = TAMANO_PAGINA_LISTADOS) {
  const total = Array.isArray(lista) ? lista.length : 0;
  return Math.max(1, Math.ceil(total / tamano));
}

export default function Paginacion({ pagina, total, alCambiar, etiqueta = "Paginación" }) {
  if (total <= 1) return null;
  return (
    <nav className="ts-pagination" aria-label={etiqueta}>
      <span>Página {pagina} de {total}</span>
      <div>
        <button type="button" className="ts-btn ts-btn--sm" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
          Anterior
        </button>
        <button type="button" className="ts-btn ts-btn--sm" disabled={pagina >= total} onClick={() => alCambiar(pagina + 1)}>
          Siguiente
        </button>
      </div>
    </nav>
  );
}
