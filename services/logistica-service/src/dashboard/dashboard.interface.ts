export interface MetricasDashboardLogisticaResponse {
  periodo: {
    desde: string | null;
    hasta: string | null;
  };
  resumen: {
    total_boletas: number;
    boletas_emitidas: number;
    rutas_en_curso: number;
    rutas_planificadas: number;
    porcentaje_entregas_completadas: number;
    total_incidencias: number;
  };
  boletas_por_estado: {
    BORRADOR: number;
    EMITIDA: number;
    ANULADA: number;
    total: number;
  };
  rutas_por_estado: {
    PLANIFICADA: number;
    DESPACHADA: number;
    COMPLETADA: number;
    CANCELADA: number;
    total: number;
  };
  entregas: {
    total_paradas: number;
    entregadas: number;
    pendientes: number;
    anuladas: number;
    porcentaje_efectividad: number;
  };
  incidencias: {
    boletas_anuladas: number;
    rutas_canceladas: number;
    entregas_anuladas: number;
    total: number;
  };
  volumen_carga: {
    total_items: number;
    cantidad_total: number;
  };
}
