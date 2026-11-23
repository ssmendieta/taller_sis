import { obtenerMetasKpiProduccion, guardarMetaKpiProduccion } from "./dashboardService.js";
import { obtenerMetasKpiLogistica, guardarMetaKpiLogistica } from "./dashboardLogisticaService.js";
import { AREAS_KPI } from "./kpis.js";

export const PERMISO_GESTIONAR_METAS = "kpis.metas.gestionar";
export const AREAS_METAS = {
  produccion: { nombre: "Producción", permiso: AREAS_KPI.produccion.permiso, listar: obtenerMetasKpiProduccion, guardar: guardarMetaKpiProduccion },
  logistica: { nombre: "Logística", permiso: AREAS_KPI.logistica.permiso, listar: obtenerMetasKpiLogistica, guardar: guardarMetaKpiLogistica },
};

// Las metas y umbrales se envían con los mismos límites que GuardarMetaKpiDto.
export function prepararMetaKpi(formulario) {
  const numero = (valor, campo, maximo, decimales) => {
    const texto = String(valor ?? "").trim();
    const n = Number(texto);
    if (!texto || !Number.isFinite(n) || n < 0 || n > maximo || Number(n.toFixed(decimales)) !== n) {
      throw new Error(`${campo}: ingresa un número entre 0 y ${maximo}, con hasta ${decimales} decimales.`);
    }
    return n;
  };
  const vacia = String(formulario.meta ?? "").trim() === "";
  const meta = vacia ? null : numero(formulario.meta, "Meta", 9999999999, 4);
  if (meta === 0) throw new Error("La meta debe ser mayor que cero; deja el campo vacío para quitarla.");
  const umbralAmarilloPct = numero(formulario.umbralAmarilloPct, "Umbral amarillo", 9999.99, 2);
  const umbralRojoPct = numero(formulario.umbralRojoPct, "Umbral rojo", 9999.99, 2);
  if (umbralRojoPct <= umbralAmarilloPct) throw new Error("El umbral rojo debe ser mayor que el umbral amarillo.");
  return { meta, umbralAmarilloPct, umbralRojoPct };
}
