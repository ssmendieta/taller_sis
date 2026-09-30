import { BadRequestException, Injectable } from '@nestjs/common';

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

@Injectable()
export class MaterialCalculationService {

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

    return materialesReceta.map((material) => ({
      ...material,
      cantidadTotal:
        material.cantidadRequerida * cantidadSolicitada,
    }));
  }
}