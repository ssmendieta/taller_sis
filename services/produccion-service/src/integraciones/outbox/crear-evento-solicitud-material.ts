import { randomUUID } from 'crypto';
import { Material } from '../../materiales/entities/material.entity';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';
import { SolicitudMaterial } from '../../solicitudes-material/entities/solicitud-material.entity';
import { SolicitudMaterialItem } from '../../solicitudes-material/entities/solicitud-material-item.entity';
import {
  SOLICITUD_MATERIAL_ALMACEN_V1,
  SolicitudMaterialAlmacenV1Event,
} from '../contratos/inventario-almacen-v1';
import { validarSolicitudMaterialAlmacenV1 } from '../contratos/inventario-almacen-v1.validator';

interface ItemSolicitudConMaterial {
  item: SolicitudMaterialItem;
  material: Material;
}

interface CrearEventoSolicitudMaterialOptions {
  eventId?: string;
  correlationId?: string;
  ocurridoEn?: Date;
}

export function crearEventoSolicitudMaterial(
  solicitud: SolicitudMaterial,
  orden: OrdenProduccion,
  items: ItemSolicitudConMaterial[],
  options: CrearEventoSolicitudMaterialOptions = {},
): SolicitudMaterialAlmacenV1Event {
  const evento: SolicitudMaterialAlmacenV1Event = {
    eventId: options.eventId ?? randomUUID(),
    eventType: SOLICITUD_MATERIAL_ALMACEN_V1,
    occurredAt: (options.ocurridoEn ?? new Date()).toISOString(),
    source: 'produccion-service',
    correlationId: options.correlationId ?? randomUUID(),
    data: {
      solicitudId: solicitud.id,
      solicitudVersion: 1,
      ordenId: orden.id,
      ordenCodigo: orden.codigo,
      solicitanteUsuarioId: solicitud.solicitanteUsuarioId,
      fechaNecesaria: orden.fecha_programada,
      items: items.map(({ item, material }) => ({
        materialId: item.materialId,
        materialCodigo: material.codigo,
        materialNombre: material.nombre,
        cantidad: String(item.cantidad),
        unidad: item.unidad,
      })),
    },
  };

  return validarSolicitudMaterialAlmacenV1(evento);
}
