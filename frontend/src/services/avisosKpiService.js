import { contarAvisosSinLeerProduccion, listarAvisosProduccion, marcarAvisoLeidoProduccion } from "./dashboardService.js";
import { contarAvisosSinLeerLogistica, listarAvisosLogistica, marcarAvisoLeidoLogistica } from "./dashboardLogisticaService.js";
import { PERMISO_CONSULTAR_RUTAS } from "./historialLogisticoService.js";
import { tienePermiso } from "./permisos.js";

// ABC-501: cada área tiene sus propios avisos; se muestran juntos según los permisos.
const AREAS = [
  { area: "produccion", permiso: "ordenes.consultar", listar: listarAvisosProduccion, contar: contarAvisosSinLeerProduccion, marcar: marcarAvisoLeidoProduccion },
  { area: "logistica", permiso: PERMISO_CONSULTAR_RUTAS, listar: listarAvisosLogistica, contar: contarAvisosSinLeerLogistica, marcar: marcarAvisoLeidoLogistica },
];

export const UNIDADES_KPI = { TIEMPO_CICLO: "horas", TIEMPO_ATENCION: "horas", INCIDENCIAS_RUTA: "por 100" };

const areasDe = (usuario) => AREAS.filter(({ permiso }) => tienePermiso(usuario, permiso));

export const puedeVerAvisos = (usuario) => areasDe(usuario).length > 0;

/** Avisos de todas las áreas permitidas, del más reciente al más antiguo. */
export async function cargarAvisos(usuario) {
  const listas = await Promise.all(areasDe(usuario).map(async ({ area, listar }) =>
    (await listar()).map((aviso) => ({ ...aviso, area }))));
  return listas.flat().sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
}

export async function contarAvisosSinLeer(usuario) {
  const totales = await Promise.all(areasDe(usuario).map(({ contar }) => contar()));
  return totales.reduce((suma, total) => suma + Number(total || 0), 0);
}

export function marcarAvisoLeido(aviso) {
  return AREAS.find(({ area }) => area === aviso.area).marcar(aviso.id);
}

export const enlaceDetalle = (aviso) => `/${aviso.area}/kpis/${encodeURIComponent(aviso.kpi)}`;
