import { CapacidadV1, ChoferErpV1, MotivoFalloErpRecursos, VehiculoErpV1 } from './recursos-logisticos-v1';

// ABC-353: filtros de GET /recursos-logisticos ya validados.
export interface ConsultaRecursosQuery {
  fecha: string;
  // null = vehículos y choferes disponibles y no disponibles.
  disponible: boolean | null;
  // Solo vehículos con capacidad suficiente en la misma unidad.
  capacidadMinima: CapacidadV1 | null;
}

export type OrigenRecursos = 'ERP' | 'RESPALDO';

export interface AvisoRespaldoRecursos {
  motivo: MotivoFalloErpRecursos;
  mensaje: string;
}

export interface ConsultaRecursosRespuesta {
  fecha: string;
  origen: OrigenRecursos;
  // Cuándo el ERP generó los datos y cuándo Logística los obtuvo.
  generadoEn: string;
  sincronizadoEn: string;
  // Solo con origen RESPALDO: por qué no se usaron datos actuales del ERP.
  aviso: AvisoRespaldoRecursos | null;
  filtros: { disponible: boolean | null; capacidadMinima: CapacidadV1 | null };
  // Recursos de la fecha antes de filtrar.
  totales: { vehiculos: number; choferes: number };
  vehiculos: VehiculoErpV1[];
  choferes: ChoferErpV1[];
}
