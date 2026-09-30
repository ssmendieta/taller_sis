import { ETIQUETAS_DISPONIBILIDAD, ETIQUETAS_ESTADO_ORDEN } from "../constants/estados.js";

// Helper único de formato (Sprint 1). Usar en TODAS las pantallas que
// muestren cantidades, fechas o estados. Números en español (es-BO),
// fechas dd/mm/aaaa y horas en 24 h.

// "12,5 kg": elimina ceros sobrantes de NUMERIC(14,4), miles con punto,
// decimales con coma. Devuelve "—" si el valor no es numérico.
export function formatearCantidad(valor, unidad) {
  const numero = Number(valor);
  if (valor == null || valor === "" || !Number.isFinite(numero)) return "—";
  const texto = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 4 }).format(numero);
  const sufijo = unidad ? ` ${unidad}` : "";
  return `${texto}${sufijo}`;
}

export function formatearNumero(valor) {
  const numero = Number(valor);
  if (valor == null || valor === "" || !Number.isFinite(numero)) return "—";
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 4 }).format(numero);
}

export function formatearFecha(valor) {
  if (!valor) return "—";
  const texto = String(valor).slice(0, 10);
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (partes) return `${partes[3]}/${partes[2]}/${partes[1]}`;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(fecha);
}

export function formatearFechaHora(valor, zona = "America/La_Paz") {
  if (!valor) return { fecha: "—", hora: "—" };
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return { fecha: "—", hora: "—" };
  return {
    fecha: new Intl.DateTimeFormat("es-BO", { timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha),
    hora: new Intl.DateTimeFormat("es-BO", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(fecha),
  };
}

export function formatearEstadoOrden(valor) {
  if (!valor) return "—";
  return ETIQUETAS_ESTADO_ORDEN[valor] ?? String(valor).replaceAll("_", " ");
}

export function formatearDisponibilidad(valor) {
  if (!valor) return "—";
  return ETIQUETAS_DISPONIBILIDAD[valor] ?? String(valor).replaceAll("_", " ");
}

// Traduce errores crudos del backend a lenguaje humano (nunca JSON).
export function mensajeHumano(fallo, respaldo = "Ocurrió un error. Intenta de nuevo.") {
  const crudo = fallo?.message ?? fallo;
  if (!crudo) return respaldo;
  const texto = String(crudo);
  if (/23505|duplicate|unique/i.test(texto)) return "Ese registro ya existe. Revisa el código o el nombre.";
  if (/23503|foreign key|restrict/i.test(texto)) return "No se puede eliminar porque está en uso en otros registros.";
  if (/jwt|token|expir|401/i.test(texto)) return "Tu sesión expiró. Vuelve a ingresar.";
  if (texto.length > 220) return respaldo;
  return texto;
}
