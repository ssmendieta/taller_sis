// Catálogo único de unidades de medida (Sprint 1).
// Única fuente de verdad en el backend: entidades, DTOs (@IsIn) y la
// migración de normalización importan este archivo. El frontend lo consume
// vía GET /unidades-medida y usa `src/constants/unidades.js` solo como
// respaldo si el backend no responde (nunca duplica la lista).

export type TipoUnidad = 'masa' | 'volumen' | 'longitud' | 'conteo';

export interface UnidadMedida {
  codigo: string;
  nombre: string;
  simbolo: string;
  tipo: TipoUnidad;
}

export const UNIDADES_MEDIDA: UnidadMedida[] = [
  { codigo: 'kg', nombre: 'Kilogramo', simbolo: 'kg', tipo: 'masa' },
  { codigo: 'g', nombre: 'Gramo', simbolo: 'g', tipo: 'masa' },
  { codigo: 'l', nombre: 'Litro', simbolo: 'l', tipo: 'volumen' },
  { codigo: 'ml', nombre: 'Mililitro', simbolo: 'ml', tipo: 'volumen' },
  { codigo: 'm', nombre: 'Metro', simbolo: 'm', tipo: 'longitud' },
  { codigo: 'cm', nombre: 'Centímetro', simbolo: 'cm', tipo: 'longitud' },
  { codigo: 'unidad', nombre: 'Unidad', simbolo: 'unidad', tipo: 'conteo' },
  { codigo: 'docena', nombre: 'Docena', simbolo: 'docena', tipo: 'conteo' },
  { codigo: 'caja', nombre: 'Caja', simbolo: 'caja', tipo: 'conteo' },
  { codigo: 'paquete', nombre: 'Paquete', simbolo: 'paquete', tipo: 'conteo' },
];

export const CODIGOS_UNIDADES: string[] = UNIDADES_MEDIDA.map((u) => u.codigo);

export const UNIDAD_POR_DEFECTO = 'unidad';

export function esUnidadValida(codigo: unknown): boolean {
  return typeof codigo === 'string' && CODIGOS_UNIDADES.includes(codigo);
}

// Normaliza variantes en texto libre al catálogo. Devuelve null si no hay
// mapeo posible (la migración usa entonces la unidad segura por defecto y
// lo reporta con RAISE NOTICE en lugar de fallar).
const MAPEO_VARIANTES: Record<string, string> = {
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogramo: 'kg',
  kilogramos: 'kg',
  kgs: 'kg',
  g: 'g',
  gr: 'g',
  grs: 'g',
  gramo: 'g',
  gramos: 'g',
  l: 'l',
  lt: 'l',
  lts: 'l',
  litro: 'l',
  litros: 'l',
  ml: 'ml',
  mililitro: 'ml',
  mililitros: 'ml',
  m: 'm',
  metro: 'm',
  metros: 'm',
  mt: 'm',
  mts: 'm',
  cm: 'cm',
  centimetro: 'cm',
  centimetros: 'cm',
  'centímetro': 'cm',
  'centímetros': 'cm',
  unidad: 'unidad',
  unidades: 'unidad',
  und: 'unidad',
  ud: 'unidad',
  u: 'unidad',
  unid: 'unidad',
  unids: 'unidad',
  pieza: 'unidad',
  piezas: 'unidad',
  pza: 'unidad',
  docena: 'docena',
  docenas: 'docena',
  doc: 'docena',
  caja: 'caja',
  cajas: 'caja',
  paquete: 'paquete',
  paquetes: 'paquete',
  pqt: 'paquete',
  pqte: 'paquete',
};

export function normalizarUnidad(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const clave = valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!clave) return null;
  if (CODIGOS_UNIDADES.includes(clave)) return clave;
  return MAPEO_VARIANTES[clave] ?? null;
}
