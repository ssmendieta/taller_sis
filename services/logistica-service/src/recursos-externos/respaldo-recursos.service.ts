import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CopiaRecursosLogisticos, RespaldoRecursosLogisticos } from './respaldo-recursos';
import { RespuestaRecursosErpV1 } from './dto/recursos-logisticos-v1';
import { RecursoExternoSnapshot } from './entities/recurso-externo-snapshot.entity';
import { RecursoExternoVehiculo } from './entities/recurso-externo-vehiculo.entity';
import { RecursoExternoChofer } from './entities/recurso-externo-chofer.entity';

// ABC-352: persistencia transaccional de la copia local de recursos logísticos.
// Cumple con el contrato v1 y la interfaz RespaldoRecursosLogisticos (ABC-353).
@Injectable()
export class RespaldoRecursosTypeOrmService implements RespaldoRecursosLogisticos {
  private readonly logger = new Logger(RespaldoRecursosTypeOrmService.name);

  constructor(
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async obtener(fecha: string): Promise<CopiaRecursosLogisticos | null> {
    if (!this.dataSource?.isInitialized) {
      return null;
    }
    const repo = this.dataSource.getRepository(RecursoExternoSnapshot);
    const snapshot = await repo.findOne({
      where: { fecha },
      order: { sincronizadoEn: 'DESC' },
    });
    if (!snapshot) {
      return null;
    }

    const sincronizadoEn =
      snapshot.sincronizadoEn instanceof Date
        ? snapshot.sincronizadoEn.toISOString()
        : new Date(snapshot.sincronizadoEn).toISOString();

    return {
      respuesta: snapshot.datos as RespuestaRecursosErpV1,
      sincronizadoEn,
    };
  }

  async reemplazar(copia: CopiaRecursosLogisticos): Promise<void> {
    if (!this.dataSource?.isInitialized) {
      this.logger.warn('DataSource no inicializado; se omite persistencia de copia de respaldo');
      return;
    }

    const fecha = copia.respuesta.fecha;

    await this.dataSource.transaction(async (manager) => {
      const snapshotRepo = manager.getRepository(RecursoExternoSnapshot);
      const vehiculoRepo = manager.getRepository(RecursoExternoVehiculo);
      const choferRepo = manager.getRepository(RecursoExternoChofer);

      // Reemplazo atómico: eliminar copia previa de la misma fecha si existe.
      const previo = await snapshotRepo.findOne({ where: { fecha } });
      if (previo) {
        await snapshotRepo.delete({ id: previo.id });
      }

      // Guardar nuevo snapshot con metadatos completos y payload íntegro.
      const nuevoSnapshot = snapshotRepo.create({
        fecha,
        version: copia.respuesta.version,
        generadoEn: new Date(copia.respuesta.generadoEn),
        sincronizadoEn: new Date(copia.sincronizadoEn),
        datos: copia.respuesta,
      });
      const guardado = await snapshotRepo.save(nuevoSnapshot);

      // Persistir filas normalizadas de vehículos asociadas al snapshot.
      if (copia.respuesta.vehiculos?.length) {
        const vehiculos = copia.respuesta.vehiculos.map((v) =>
          vehiculoRepo.create({
            snapshotId: guardado.id,
            fecha,
            idExterno: v.idExterno,
            placa: v.placa,
            descripcion: v.descripcion,
            capacidadValor: v.capacidad.valor,
            capacidadUnidad: v.capacidad.unidad,
            disponible: v.disponible,
          }),
        );
        await vehiculoRepo.save(vehiculos);
      }

      // Persistir filas normalizadas de choferes asociadas al snapshot.
      if (copia.respuesta.choferes?.length) {
        const choferes = copia.respuesta.choferes.map((c) =>
          choferRepo.create({
            snapshotId: guardado.id,
            fecha,
            idExterno: c.idExterno,
            nombre: c.nombre,
            licenciaCategoria: c.licenciaCategoria,
            disponible: c.disponible,
          }),
        );
        await choferRepo.save(choferes);
      }
    });

    this.logger.log(`Copia de respaldo persistida exitosamente para fecha ${fecha}`);
  }
}
