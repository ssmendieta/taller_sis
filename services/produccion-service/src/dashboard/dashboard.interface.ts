export interface DesglosePerdidaMaterial {
  material_id: string;
  material_codigo: string;
  material_nombre: string;
  unidad: string;
  cantidad: number;
}

export interface MetricasDashboardResponse {
  periodo: {
    desde: string | null;
    hasta: string | null;
  };
  resumen: {
    total_ordenes: number;
    porcentaje_conformes: number;
    porcentaje_avance_global: number;
    total_incidencias: number;
    total_perdidas: number;
  };
  ordenes_por_estado: {
    PENDIENTE: number;
    PLANIFICADA: number;
    EN_PRODUCCION: number;
    FINALIZADA: number;
    CANCELADA: number;
    total: number;
  };
  calidad: {
    unidades_conformes: number;
    unidades_defectuosas: number;
    total_evaluado: number;
    porcentaje_conformes: number;
    porcentaje_defectuosas: number;
  };
  avance_global: {
    cantidad_solicitada_total: number;
    cantidad_producida_total: number;
    cantidad_pendiente_total: number;
    porcentaje_avance_global: number;
    total_registros_avance: number;
  };
  perdidas_materia_prima: {
    total_registros: number;
    cantidad_total: number;
    desglose_por_material: DesglosePerdidaMaterial[];
  };
  incidencias: {
    total_observaciones: number;
    total_incidencias: number;
    total: number;
  };
}
