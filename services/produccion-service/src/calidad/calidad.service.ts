import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';

export const PERMISO_CONSULTAR_CONFORMES = 'ordenes.consultar';

interface FilaConformesOrden {
  orden_id: number | string;
  orden_codigo: string;
  producto_id: number | string;
  producto_codigo: string;
  producto_nombre: string;
  unidad: string;
  cantidad_conforme: string | number;
  version: string | number;
  fecha: Date | string | null;
}

export interface ConformesOrdenResponse {
  ordenId: number;
  ordenCodigo: string;
  producto: {
    id: number;
    codigo: string;
    nombre: string;
    unidad: string;
  };
  cantidadConforme: string;
  version: number;
  fecha: string | null;
  permisoRequerido: typeof PERMISO_CONSULTAR_CONFORMES;
}

function cantidadDecimal(valor: string | number): string {
  return Number(valor).toFixed(4);
}

function fechaIso(valor: Date | string | null): string | null {
  if (valor === null) return null;
  return valor instanceof Date ? valor.toISOString() : new Date(valor).toISOString();
}

@Injectable()
export class CalidadService {
  constructor(
    @InjectRepository(OrdenProduccion)
    private readonly ordenesRepository: Repository<OrdenProduccion>,
  ) {}

  async consultarConformes(ordenId: number): Promise<ConformesOrdenResponse> {
    const filas = (await this.ordenesRepository.query(
      `SELECT o.id AS orden_id,
              o.codigo AS orden_codigo,
              r.id AS producto_id,
              r.producto_codigo,
              r.producto_nombre,
              r.unidad_producto AS unidad,
              COALESCE(SUM(a.cantidad_producida), 0) AS cantidad_conforme,
              COUNT(a.id) AS version,
              MAX(a.fecha_hora) AS fecha
       FROM ordenes_produccion o
       JOIN recetas r ON r.id = o.receta_id
       LEFT JOIN avances_produccion a ON a.orden_id = o.id
       WHERE o.id = $1
       GROUP BY o.id, o.codigo, r.id, r.producto_codigo,
                r.producto_nombre, r.unidad_producto`,
      [ordenId],
    )) as FilaConformesOrden[];

    const fila = filas[0];
    if (!fila) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }

    return {
      ordenId: Number(fila.orden_id),
      ordenCodigo: fila.orden_codigo,
      producto: {
        id: Number(fila.producto_id),
        codigo: fila.producto_codigo,
        nombre: fila.producto_nombre,
        unidad: fila.unidad,
      },
      cantidadConforme: cantidadDecimal(fila.cantidad_conforme),
      version: Number(fila.version),
      fecha: fechaIso(fila.fecha),
      permisoRequerido: PERMISO_CONSULTAR_CONFORMES,
    };
  }
}
