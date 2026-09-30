import { tienePermiso } from "../services/permisos.js";

// Transiciones válidas (espejo de estado-orden.transiciones.ts del backend).
// El backend es la barrera real; aquí solo se decide qué mostrar/habilitar.
export const TRANSICIONES = {
  PENDIENTE: ["PLANIFICADA", "CANCELADA"],
  PLANIFICADA: ["EN_PRODUCCION", "CANCELADA"],
  EN_PRODUCCION: ["FINALIZADA", "CANCELADA"],
  FINALIZADA: [],
  CANCELADA: [],
};

export const PERMISO_POR_ESTADO = {
  PLANIFICADA: "ordenes.cambiar_estado",
  EN_PRODUCCION: "ordenes.iniciar",
  FINALIZADA: "ordenes.finalizar_cancelar",
  CANCELADA: "ordenes.finalizar_cancelar",
};

export const ETIQUETAS_ACCION = {
  PLANIFICADA: { titulo: "planificación", verbo: "Planificar" },
  EN_PRODUCCION: { titulo: "inicio de producción", verbo: "Iniciar producción" },
  FINALIZADA: { titulo: "finalización", verbo: "Finalizar" },
  CANCELADA: { titulo: "cancelación", verbo: "Cancelar" },
};

export function puedeEjecutar(usuario, nuevoEstado) {
  const permiso = PERMISO_POR_ESTADO[nuevoEstado];
  return permiso ? tienePermiso(usuario, permiso) : false;
}

export function accionesPara(usuario, estado) {
  return (TRANSICIONES[estado] ?? []).map((destino) => ({
    destino,
    ...ETIQUETAS_ACCION[destino],
    permitida: puedeEjecutar(usuario, destino),
  }));
}

export function puedeVerAcciones(usuario) {
  return (
    tienePermiso(usuario, "ordenes.cambiar_estado") ||
    tienePermiso(usuario, "ordenes.iniciar") ||
    tienePermiso(usuario, "ordenes.finalizar_cancelar")
  );
}

export function puedeCrear(usuario) {
  return tienePermiso(usuario, "ordenes.crear");
}

export function puedeRegistrarAvance(usuario) {
  return tienePermiso(usuario, "ordenes.registrar_avance");
}
