import { randomUUID } from 'crypto';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';
import {
  DISPONIBILIDAD_MATERIAL_SOLICITADA_V1,
  DisponibilidadMaterialSolicitadaV1Event,
  MaterialRequeridoV1,
} from '../contratos/inventario-almacen-v1';
import { validarDisponibilidadMaterialSolicitadaV1 } from '../contratos/inventario-almacen-v1.validator';
import { ConsultaDisponibilidad } from '../disponibilidad/entities/consulta-disponibilidad.entity';

interface CrearEventoDisponibilidadOptions {
  eventId?: string;
  correlationId?: string;
  ocurridoEn?: Date;
}

export function crearEventoDisponibilidadMaterial(
  consulta: ConsultaDisponibilidad,
  orden: OrdenProduccion,
  materiales: MaterialRequeridoV1[],
  options: CrearEventoDisponibilidadOptions = {},
): DisponibilidadMaterialSolicitadaV1Event {
  const evento: DisponibilidadMaterialSolicitadaV1Event = {
    eventId: options.eventId ?? consulta.requestEventId ?? randomUUID(),
    eventType: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1,
    occurredAt: (options.ocurridoEn ?? new Date()).toISOString(),
    source: 'produccion-service',
    correlationId: options.correlationId ?? consulta.correlationId ?? randomUUID(),
    data: {
      consultaId: consulta.consultaId,
      consultaVersion: consulta.consultaVersion,
      ordenId: orden.id,
      ordenCodigo: orden.codigo,
      fechaNecesaria: String(orden.fecha_programada).slice(0, 10),
      materiales,
    },
  };

  return validarDisponibilidadMaterialSolicitadaV1(evento);
}
