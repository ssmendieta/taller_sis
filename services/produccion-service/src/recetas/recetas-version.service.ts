import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Receta } from './receta.entity';
import { RecetaMaterial } from './receta-material.entity';

@Injectable()
export class RecetasVersionService {
  constructor(private readonly dataSource: DataSource) {}

  async crearNuevaVersion(
    recetaId: string,
    productoNombre: string,
    materiales: {
      materialId: string;
      cantidadRequerida: number;
    }[],
  ) {
    return this.dataSource.transaction(async (manager) => {
      const recetaAnterior = await manager.findOne(Receta, {
        where: { id: recetaId },
      });

      if (!recetaAnterior) {
        throw new NotFoundException('Receta no encontrada');
      }

      // Desactivar la versión anterior
      await manager.update(
        Receta,
        { id: recetaId },
        { activa: false },
      );

      // Crear una nueva versión sin borrar la anterior
      const nuevaReceta = manager.create(Receta, {
        productoCodigo: recetaAnterior.productoCodigo,
        productoNombre,
        activa: true,
      });

      const recetaGuardada = await manager.save(Receta, nuevaReceta);

      // Guardar los materiales de la nueva versión
      const nuevosMateriales = materiales.map((material) =>
        manager.create(RecetaMaterial, {
          recetaId: recetaGuardada.id,
          materialId: material.materialId,
          cantidadRequerida: material.cantidadRequerida,
        }),
      );

      await manager.save(RecetaMaterial, nuevosMateriales);

      return recetaGuardada;
    });
  }
}