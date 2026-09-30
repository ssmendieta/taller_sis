import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
// Resolución de integración: los archivos duplicados receta.entity.ts y
// receta-material.entity.ts de RamaTats se descartan; este servicio reutiliza
// las entidades de develop (mismas tablas y columnas) para no mapearlas dos veces.
import { Receta } from './entities/receta.entity';
import { RecetaMaterial } from './entities/receta-material.entity';

@Injectable()
export class RecetasVersionService {
  constructor(private readonly dataSource: DataSource) {}

  async crearNuevaVersion(
    recetaId: number,
    productoNombre: string,
    materiales: {
      materialId: number;
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