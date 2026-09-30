// Respaldo local del catálogo de unidades. La fuente de verdad es el
// backend (GET /api/produccion/unidades-medida); este archivo solo se usa
// si el backend no responde. No duplicar esta lista en otras pantallas.
export const UNIDADES_RESPALDO = [
  { codigo: "kg", nombre: "Kilogramo", simbolo: "kg", tipo: "masa" },
  { codigo: "g", nombre: "Gramo", simbolo: "g", tipo: "masa" },
  { codigo: "l", nombre: "Litro", simbolo: "l", tipo: "volumen" },
  { codigo: "ml", nombre: "Mililitro", simbolo: "ml", tipo: "volumen" },
  { codigo: "m", nombre: "Metro", simbolo: "m", tipo: "longitud" },
  { codigo: "cm", nombre: "Centímetro", simbolo: "cm", tipo: "longitud" },
  { codigo: "unidad", nombre: "Unidad", simbolo: "unidad", tipo: "conteo" },
  { codigo: "docena", nombre: "Docena", simbolo: "docena", tipo: "conteo" },
  { codigo: "caja", nombre: "Caja", simbolo: "caja", tipo: "conteo" },
  { codigo: "paquete", nombre: "Paquete", simbolo: "paquete", tipo: "conteo" },
];

export const CODIGOS_UNIDADES_RESPALDO = UNIDADES_RESPALDO.map((u) => u.codigo);

export function etiquetaUnidad(unidad) {
  return unidad ?? "—";
}
