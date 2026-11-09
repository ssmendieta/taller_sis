import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { TipoResultadoCalidad } from '../calidad/entities/tipo-resultado-calidad.enum';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { RegistrarReprocesoDto } from './dto/registrar-reproceso.dto';
import { Reproceso } from './entities/reproceso.entity';

export interface TotalesReproceso {
  conformes: string;
  defectuosas: string;
  procesadas: string;
  recuperadas: string;
  descartadas: string;
}

@Injectable()
export class ReprocesosService {
  constructor(private readonly dataSource: DataSource) {}

  async registrar(ordenId: number, dto: RegistrarReprocesoDto, autorUsuarioId: number) {
    this.validarOrdenId(ordenId);
    if (BigInt(dto.resultadoCalidadId) > 9223372036854775807n) {
      throw new BadRequestException('El id del resultado de calidad no es válido');
    }

    const cantidades = [dto.cantidadProcesada, dto.cantidadRecuperada, dto.cantidadDescartada];
    if (cantidades.some((cantidad) => Number(cantidad.toFixed(4)) !== cantidad)) {
      throw new BadRequestException('Las cantidades admiten hasta cuatro decimales');
    }

    const cantidadProcesada = dto.cantidadProcesada.toFixed(4);
    const cantidadRecuperada = dto.cantidadRecuperada.toFixed(4);
    const cantidadDescartada = dto.cantidadDescartada.toFixed(4);
    const unidades = (cantidad: string) => BigInt(cantidad.replace('.', ''));

    if (unidades(cantidadRecuperada) + unidades(cantidadDescartada) !== unidades(cantidadProcesada)) {
      throw new BadRequestException('Las cantidades recuperada y descartada deben sumar la procesada');
    }

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // Calidad también bloquea primero la orden al registrar resultados.
      const orden = await manager.findOne(OrdenProduccion, {
        where: { id: ordenId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!orden) throw new NotFoundException('Orden de producción no encontrada');

      const resultado = await manager.findOne(ResultadoConforme, {
        where: { id: dto.resultadoCalidadId, ordenId: String(ordenId) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!resultado) throw new NotFoundException('Resultado de calidad no encontrado en la orden');
      if (resultado.tipo !== TipoResultadoCalidad.DEFECTUOSO) {
        throw new ConflictException('Solo se pueden reprocesar resultados defectuosos');
      }

      const { saldo } = await manager.getRepository(Reproceso).createQueryBuilder('reproceso')
        .select('(:cantidad::numeric(14,4) - COALESCE(SUM(reproceso.cantidadProcesada), 0))::text', 'saldo')
        .where('reproceso.resultadoCalidadId = :resultadoId', { resultadoId: resultado.id })
        .setParameter('cantidad', resultado.cantidad)
        .getRawOne<{ saldo: string }>();
      if (unidades(cantidadProcesada) > unidades(saldo)) {
        throw new ConflictException('La cantidad procesada supera el saldo defectuoso disponible');
      }

      const reproceso = await manager.save(Reproceso, {
        ordenId: String(ordenId),
        resultadoCalidadId: resultado.id,
        cantidadProcesada,
        cantidadRecuperada,
        cantidadDescartada,
        autorUsuarioId: String(autorUsuarioId),
      });
      return { reproceso, totales: await this.totales(manager, String(ordenId)) };
    });
  }

  async consultar(ordenId: number) {
    this.validarOrdenId(ordenId);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      if (!await manager.existsBy(OrdenProduccion, { id: ordenId })) {
        throw new NotFoundException('Orden de producción no encontrada');
      }
      const items = await manager.find(Reproceso, {
        where: { ordenId: String(ordenId) },
        order: { fechaHora: 'ASC', id: 'ASC' },
      });
      return { items, totales: await this.totales(manager, String(ordenId)) };
    });
  }

  private validarOrdenId(id: number) {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException('El id de la orden debe ser un entero positivo válido');
    }
  }

  private async totales(manager: EntityManager, ordenId: string): Promise<TotalesReproceso> {
    const calidad = manager.createQueryBuilder(ResultadoConforme, 'resultado')
      .select("COALESCE(SUM(resultado.cantidad) FILTER (WHERE resultado.tipo = 'CONFORME'), 0.0000)", 'conformes')
      .addSelect("COALESCE(SUM(resultado.cantidad) FILTER (WHERE resultado.tipo = 'DEFECTUOSO'), 0.0000)", 'defectuosas')
      .where('resultado.ordenId = :ordenId', { ordenId });

    const reproceso = manager.createQueryBuilder(Reproceso, 'reproceso')
      .select('COALESCE(SUM(reproceso.cantidadProcesada), 0.0000)', 'procesadas')
      .addSelect('COALESCE(SUM(reproceso.cantidadRecuperada), 0.0000)', 'recuperadas')
      .addSelect('COALESCE(SUM(reproceso.cantidadDescartada), 0.0000)', 'descartadas')
      .where('reproceso.ordenId = :ordenId', { ordenId });

    return manager.createQueryBuilder()
      .addCommonTableExpression(calidad, 'calidad')
      .addCommonTableExpression(reproceso, 'reproceso')
      .select('(calidad.conformes + reproceso.recuperadas)::text', 'conformes')
      .addSelect('(calidad.defectuosas - reproceso.procesadas)::text', 'defectuosas')
      .addSelect('reproceso.procesadas::text', 'procesadas')
      .addSelect('reproceso.recuperadas::text', 'recuperadas')
      .addSelect('reproceso.descartadas::text', 'descartadas')
      .from('calidad', 'calidad')
      .addFrom('reproceso', 'reproceso')
      .getRawOne<TotalesReproceso>();
  }
}
