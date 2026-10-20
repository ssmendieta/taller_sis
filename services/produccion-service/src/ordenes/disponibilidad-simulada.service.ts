import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';

import { OrdenProduccion } from './entities/orden-produccion.entity';
import {
  ESTADO_CONSULTA_DISPONIBILIDAD_PENDIENTE,
  ESTADO_CONSULTA_DISPONIBILIDAD_RESPONDIDA,
  ConsultaDisponibilidad,
} from '../integraciones/disponibilidad/entities/consulta-disponibilidad.entity';
import { ConsultaDisponibilidadItem } from '../integraciones/disponibilidad/entities/consulta-disponibilidad-item.entity';
import { EstadoDisponibilidadMaterial } from '../integraciones/contratos/inventario-almacen-v1';

// Respuesta local de disponibilidad para trabajar sin Inventarios ni Pub/Sub.
// Los datos son de prueba: el disponible duplica lo requerido por la receta.
const FACTOR_DISPONIBLE = 2;
const ESTADO_SUFICIENTE: EstadoDisponibilidadMaterial = 'SUFICIENTE';

@Injectable()
export class DisponibilidadSimuladaService {
  activada(): boolean {
    return String(process.env.DISPONIBILIDAD_SIMULADA ?? '').toLowerCase() === 'true';
  }

  // Completa la consulta pendiente de la orden o crea la primera versión.
  // No hace nada si la última consulta ya está respondida.
  async responder(manager: EntityManager, orden: OrdenProduccion): Promise<ConsultaDisponibilidad | null> {
    const materiales = await manager.query(
      `
      SELECT
        m.id::text AS material_id,
        m.codigo,
        m.nombre,
        m.unidad_medida,
        ROUND((rm.cantidad_requerida * o.cantidad_solicitada)::numeric, 4)::text AS cantidad_requerida
      FROM ordenes_produccion o
      INNER JOIN receta_material rm ON rm.receta_id = o.receta_id
      INNER JOIN materiales m ON m.id = rm.material_id
      WHERE o.id = $1
      ORDER BY m.id ASC
    `,
      [orden.id],
    ) as Array<{
      material_id: string;
      codigo: string;
      nombre: string;
      unidad_medida: string;
      cantidad_requerida: string;
    }>;
    if (materiales.length === 0) return null;

    const ultima = await manager.findOne(ConsultaDisponibilidad, {
      where: { ordenId: String(orden.id) },
      order: { consultaVersion: 'DESC' },
    });

    if (ultima && ultima.estado === ESTADO_CONSULTA_DISPONIBILIDAD_RESPONDIDA) {
      return ultima;
    }

    let consulta = ultima;
    if (!consulta) {
      const version = 1;
      consulta = await manager.save(
        ConsultaDisponibilidad,
        manager.create(ConsultaDisponibilidad, {
          consultaId: `DISP-ORD-${orden.id}-V${version}`,
          consultaVersion: version,
          ordenId: String(orden.id),
          requestEventId: randomUUID(),
          correlationId: randomUUID(),
          estado: ESTADO_CONSULTA_DISPONIBILIDAD_PENDIENTE,
        }),
      );
    }

    let items = await manager.find(ConsultaDisponibilidadItem, {
      where: { consultaDisponibilidadId: consulta.id },
    });
    if (items.length === 0) {
      items = await manager.save(
        ConsultaDisponibilidadItem,
        materiales.map((material) => manager.create(ConsultaDisponibilidadItem, {
          consultaDisponibilidadId: consulta.id,
          materialId: material.material_id,
          materialCodigo: material.codigo,
          materialNombre: material.nombre,
          cantidadRequerida: material.cantidad_requerida,
          cantidadDisponible: null,
          unidad: material.unidad_medida,
          estado: null,
        })),
      );
    }

    for (const item of items) {
      const material = materiales.find((m) => m.material_id === item.materialId);
      const requerida = material?.cantidad_requerida ?? item.cantidadRequerida;
      item.cantidadDisponible = (Number(requerida) * FACTOR_DISPONIBLE).toFixed(4);
      item.estado = ESTADO_SUFICIENTE;
    }
    await manager.save(ConsultaDisponibilidadItem, items);

    consulta.estado = ESTADO_CONSULTA_DISPONIBILIDAD_RESPONDIDA;
    consulta.responseEventId = randomUUID();
    consulta.vigenteEn = new Date();
    return manager.save(ConsultaDisponibilidad, consulta);
  }
}
