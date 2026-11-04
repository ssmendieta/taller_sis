import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConsumosMaterialService } from '../consumos-material/consumos-material.service';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';

export interface ComparacionMaterialOrden {
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  unidad: string;
  cantidadRequerida: string;
  cantidadConsumida: string;
  diferencia: string;
}

// La multiplicacion de dos NUMERIC(14,4) puede tener ocho decimales.
// Mantiene exactitud tanto en cantidades grandes como en diferencias pequeñas.
function escalarDecimal(valor: string): bigint {
  const [entero, decimales = ''] = valor.split('.');
  return BigInt(entero) * 100000000n + BigInt(decimales.padEnd(8, '0'));
}

function decimalTexto(valor: bigint): string {
  const negativo = valor < 0n;
  const texto = (negativo ? -valor : valor).toString().padStart(9, '0');
  const fraccion = texto.slice(-8).replace(/0+$/, '').padEnd(4, '0');
  return `${negativo ? '-' : ''}${texto.slice(0, -8)}.${fraccion}`;
}

export interface MaterialReceta {
  materialId: number;
  materialCodigo?: string;
  materialNombre?: string;
  unidadMedida?: string;
  cantidadRequerida: number;
}

export interface MaterialCalculado extends MaterialReceta {
  cantidadTotal: number;
}

// Cálculo compartido: multiplica cada línea por la cantidad solicitada.
// Lo usan POST /material-calculation/calcular y GET /ordenes/:id/materiales.
export function multiplicarMateriales(
  cantidadSolicitada: number,
  materialesReceta: MaterialReceta[],
): MaterialCalculado[] {
  return materialesReceta.map((material) => ({
    ...material,
    cantidadTotal: Number(material.cantidadRequerida) * Number(cantidadSolicitada),
  }));
}

@Injectable()
export class MaterialCalculationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly consumosService: ConsumosMaterialService,
  ) {}

  async compararConsumoPorOrden(ordenId: number): Promise<{ ordenId: string; materiales: ComparacionMaterialOrden[] }> {
    if (!Number.isSafeInteger(ordenId) || ordenId < 1) {
      throw new BadRequestException('El id de la orden debe ser un entero positivo válido');
    }
    const repository = this.dataSource.getRepository(OrdenProduccion);
    if (!await repository.existsBy({ id: ordenId })) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }
    // Reutiliza la relacion orden -> receta -> materiales. Multiplica en PG
    // antes de leer para conservar la precision de los valores persistidos.
    const requeridos = await repository.createQueryBuilder('orden')
      .innerJoin(RecetaMaterial, 'item', 'item.recetaId = orden.producto_id')
      .innerJoin(Material, 'material', 'material.id = item.materialId')
      .select('material.id::text', 'materialId')
      .addSelect('material.codigo', 'materialCodigo')
      .addSelect('material.nombre', 'materialNombre')
      .addSelect('material.unidadMedida', 'unidad')
      .addSelect('(item.cantidadRequerida * orden.cantidad)::text', 'cantidadRequerida')
      .where('orden.id = :ordenId', { ordenId })
      .orderBy('material.id', 'ASC')
      .getRawMany<Omit<ComparacionMaterialOrden, 'cantidadConsumida' | 'diferencia'>>();

    // ABC-71 suma todos los registros de cada material por unidad.
    const consumidos = await this.consumosService.totales(ordenId);
    const materiales = new Map<string, ComparacionMaterialOrden>();
    for (const material of requeridos) {
      materiales.set(material.materialId, {
        ...material, cantidadRequerida: decimalTexto(escalarDecimal(material.cantidadRequerida)),
        cantidadConsumida: '0.0000', diferencia: '0.0000',
      });
    }
    for (const consumo of consumidos) {
      let material = materiales.get(consumo.materialId);
      if (!material) {
        // No oculta consumos historicos si el material ya no esta en la receta.
        const existente = await this.dataSource.getRepository(Material).findOneByOrFail({ id: Number(consumo.materialId) });
        material = {
          materialId: consumo.materialId, materialCodigo: existente.codigo, materialNombre: existente.nombre,
          unidad: existente.unidadMedida, cantidadRequerida: '0.0000', cantidadConsumida: '0.0000', diferencia: '0.0000',
        };
        materiales.set(consumo.materialId, material);
      }
      if (consumo.unidad !== material.unidad) {
        throw new ConflictException(`No se puede comparar el material ${consumo.materialId}: consumo en ${consumo.unidad} y requerido en ${material.unidad}`);
      }
      material.cantidadConsumida = decimalTexto(escalarDecimal(consumo.cantidadTotal));
    }
    for (const material of materiales.values()) {
      material.diferencia = decimalTexto(escalarDecimal(material.cantidadConsumida) - escalarDecimal(material.cantidadRequerida));
    }
    return {
      ordenId: String(ordenId), materiales: [...materiales.values()].sort((a, b) => {
        const left = BigInt(a.materialId);
        const right = BigInt(b.materialId);
        return left < right ? -1 : left > right ? 1 : 0;
      }),
    };
  }

  calcularMateriales(
    cantidadSolicitada: number,
    materialesReceta: MaterialReceta[],
  ): MaterialCalculado[] {

    if (!(cantidadSolicitada > 0)) {
      throw new BadRequestException(
        'La cantidad solicitada debe ser mayor a cero.',
      );
    }

    if (!Array.isArray(materialesReceta) || materialesReceta.length === 0) {
      throw new BadRequestException('materialesReceta no puede estar vacía.');
    }

    return multiplicarMateriales(cantidadSolicitada, materialesReceta);
  }
}
