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

// Diferencia con signo visible: "+3 kg", "-2,5 kg" o "0 kg".
export function formatearDiferencia(valor, unidad) {
  const numero = Number(valor);
  if (valor == null || valor === "" || !Number.isFinite(numero)) return "—";
  // `|| 0` evita mostrar "-0".
  return `${numero > 0 ? "+" : ""}${formatearCantidad(numero || 0, unidad)}`;
}

// Filas de la comparación ABC-72 tal como llegan de la API: cada cifra lleva la
// unidad de su propio material y un dato ausente se muestra "—", nunca 0.
export function filasComparacionMateriales(materiales) {
  return (Array.isArray(materiales) ? materiales : []).map((m) => ({
    clave: `${m.materialId}-${m.unidad}`,
    nombre: m.materialNombre ?? "—",
    codigo: m.materialCodigo ?? "—",
    requerido: formatearCantidad(m.cantidadRequerida, m.unidad),
    utilizado: formatearCantidad(m.cantidadConsumida, m.unidad),
    diferencia: formatearDiferencia(m.diferencia, m.unidad),
    fueraDeReceta: Number(m.cantidadRequerida) === 0 && Number(m.cantidadConsumida) > 0,
  }));
}

// Estado contable que guarda nuestra API en el cierre: `estadoContable` es PENDIENTE
// hasta que llega RegistroContableResultado.v1 y solo entonces pasa a RECIBIDO o
// RECHAZADO. PENDIENTE sigue así aunque la respuesta tarde (simulador detenido) y un
// valor desconocido no se interpreta.
const ESTADOS_CONTABLES = {
  PENDIENTE: { etiqueta: "Pendiente · sin respuesta", clase: "ts-badge--PENDIENTE" },
  RECIBIDO: { etiqueta: "Recibido", clase: "ts-badge--FINALIZADA" },
  RECHAZADO: { etiqueta: "Rechazado", clase: "ts-badge--CANCELADA" },
};
export const MAX_CAUSA_RECHAZO_RESUMIDA = 100;

export function resumenReporteContable(cierre) {
  const estado = cierre?.estadoContable;
  const base = ESTADOS_CONTABLES[estado];
  if (!base) {
    return {
      estado: null, etiqueta: "Sin estado informado", clase: "ts-badge--inactivo",
      pendiente: false, actualizadoEn: null, causaResumida: null, causaCompleta: null,
    };
  }

  const pendiente = estado === "PENDIENTE";
  const resumen = {
    estado, ...base, pendiente,
    actualizadoEn: pendiente ? null : cierre.resultadoContableEn ?? null,
    causaResumida: null, causaCompleta: null,
  };
  if (estado === "RECHAZADO") {
    const causa = [cierre.codigoRechazoContable, cierre.detalleContable]
      .map((parte) => (parte == null ? "" : String(parte).trim()))
      .filter(Boolean)
      .join(": ") || "Contabilidad no informó la causa.";
    resumen.causaCompleta = causa;
    resumen.causaResumida = causa.length > MAX_CAUSA_RECHAZO_RESUMIDA
      ? `${causa.slice(0, MAX_CAUSA_RECHAZO_RESUMIDA).trimEnd()}…`
      : causa;
  }
  return resumen;
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
  if (/órdenes asociadas|ordenes asociadas|nueva versión|nueva version/i.test(texto)) return "Esta receta ya tiene órdenes asociadas. Crea una nueva versión en lugar de editarla.";
  if (/23503|foreign key|restrict/i.test(texto)) return "No se puede eliminar porque está en uso en otros registros.";
  if (/jwt|token|expir|401/i.test(texto)) return "Tu sesión expiró. Vuelve a ingresar.";
  if (texto.length > 220) return respaldo;
  return texto;
}
