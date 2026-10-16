import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { TipoResultadoCalidad } from '../calidad/entities/tipo-resultado-calidad.enum';
import { ConsumoMaterial } from '../consumos-material/entities/consumo-material.entity';
import { ConsumoCierreV1 } from '../integraciones/contratos/contabilidad-v1';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { EstadoOrden } from '../ordenes/estado-orden.enum';
import { Receta } from '../recetas/entities/receta.entity';
import { PrepararCierreDto } from './dto/preparar-cierre.dto';
import { CierreProduccion } from './entities/cierre-produccion.entity';

function decimalSnapshot(valor: string, limitado = true) {
  if (!/^\d+(?:\.\d{1,4})?$/.test(valor)) {
    throw new ConflictException('Los registros de la orden contienen cantidades inválidas para el cierre');
  }
  const [entero, fraccion = ''] = valor.split('.');
  const unidades = BigInt(entero) * 10000n + BigInt(fraccion.padEnd(4, '0'));
  if (limitado && unidades > 99999999999999n) {
    throw new ConflictException('Los totales superan la precisión del snapshot de cierre');
  }
  return { unidades, texto: `${BigInt(entero)}.${fraccion.padEnd(4, '0')}` };
}

@Injectable()
export class CierreProduccionService {
  constructor(
    @InjectRepository(CierreProduccion) private readonly cierres: Repository<CierreProduccion>,
    private readonly dataSource: DataSource,
  ) {}

  private validarReferencia(ordenId: number, cierreVersion: number) {
    if (!Number.isSafeInteger(ordenId) || ordenId < 1 ||
        !Number.isInteger(cierreVersion) || cierreVersion < 1 || cierreVersion > 2147483647) {
      throw new BadRequestException('La orden y la versión de cierre deben ser enteros positivos válidos');
    }
  }

  async preparar(dto: PrepararCierreDto): Promise<CierreProduccion> {
    const cierreVersion = dto.cierreVersion === undefined ? 1 : dto.cierreVersion;
    this.validarReferencia(dto.ordenId, cierreVersion);
    try {
      return await this.dataSource.transaction('REPEATABLE READ', async (manager) => {
        const orden = await manager.findOne(OrdenProduccion, {
          where: { id: dto.ordenId }, lock: { mode: 'pessimistic_write' },
        });
        if (!orden) throw new NotFoundException(`Orden con id ${dto.ordenId} no encontrada`);
        if (orden.estado !== EstadoOrden.FINALIZADA || !orden.finalizada_en) {
          throw new ConflictException('El resumen de cierre requiere una orden FINALIZADA con fecha de finalización');
        }
        const cierres = manager.getRepository(CierreProduccion);
        if (await cierres.existsBy({ ordenId: String(dto.ordenId), cierreVersion })) {
          throw new ConflictException('Ya existe un resumen de cierre para esta orden y versión');
        }
        const receta = await manager.findOne(Receta, { where: { id: Number(orden.producto_id) } });
        if (!receta || !receta.productoCodigo?.trim() || !receta.productoNombre?.trim() || !receta.unidadProducto?.trim()) {
          throw new ConflictException('La orden no tiene los datos de producto requeridos para el cierre');
        }
        const avance = await manager.getRepository(AvancesProduccion).createQueryBuilder('avance')
          .select('COALESCE(SUM(avance.cantidad_producida), 0)::text', 'total')
          .where('avance.orden_id = :ordenId', { ordenId: String(dto.ordenId) })
          .getRawOne<{ total: string }>();
        const calidad = await manager.getRepository(ResultadoConforme).createQueryBuilder('resultado')
          .select('COALESCE(SUM(resultado.cantidad) FILTER (WHERE resultado.tipo = :conforme), 0)::text', 'conforme')
          .addSelect('COALESCE(SUM(resultado.cantidad) FILTER (WHERE resultado.tipo = :defectuoso), 0)::text', 'defectuosa')
          .where('resultado.ordenId = :ordenId', { ordenId: String(dto.ordenId) })
          .setParameters({ conforme: TipoResultadoCalidad.CONFORME, defectuoso: TipoResultadoCalidad.DEFECTUOSO })
          .getRawOne<{ conforme: string; defectuosa: string }>();
        const solicitada = decimalSnapshot(String(orden.cantidad));
        const producida = decimalSnapshot(avance.total);
        const conforme = decimalSnapshot(calidad.conforme);
        const defectuosa = decimalSnapshot(calidad.defectuosa);
        if (solicitada.unidades === 0n || conforme.unidades + defectuosa.unidades > producida.unidades) {
          throw new ConflictException('Los totales de la orden no son válidos para preparar el cierre');
        }
        const consumos = await manager.getRepository(ConsumoMaterial).createQueryBuilder('consumo')
          .innerJoin(Material, 'material', 'material.id = consumo.materialId')
          .select('CAST(consumo.materialId AS text)', 'materialId')
          .addSelect('material.codigo', 'materialCodigo')
          .addSelect('material.nombre', 'materialNombre')
          .addSelect('SUM(consumo.cantidad)::text', 'cantidad')
          .addSelect('consumo.unidad', 'unidad')
          .where('consumo.ordenId = :ordenId', { ordenId: String(dto.ordenId) })
          .groupBy('consumo.materialId').addGroupBy('material.codigo').addGroupBy('material.nombre').addGroupBy('consumo.unidad')
          .orderBy('consumo.materialId', 'ASC').addOrderBy('consumo.unidad', 'ASC')
          .getRawMany<ConsumoCierreV1>();
        const guardado = await cierres.save(cierres.create({
          ordenId: String(dto.ordenId), cierreVersion, ordenCodigo: orden.codigo,
          producto: { productoId: Number(orden.producto_id), codigo: receta.productoCodigo, nombre: receta.productoNombre, unidad: receta.unidadProducto },
          cantidadSolicitada: solicitada.texto, cantidadProducida: producida.texto,
          cantidadConforme: conforme.texto, cantidadDefectuosa: defectuosa.texto,
          consumos: consumos.map((consumo) => ({ ...consumo, cantidad: decimalSnapshot(consumo.cantidad, false).texto })),
          finalizadaAt: orden.finalizada_en,
        }));
        return cierres.findOneByOrFail({ id: guardado.id });
      });
    } catch (error) {
      const dbError = error?.driverError ?? error;
      if (dbError?.code === '23505' && dbError.constraint === 'uq_cierres_produccion_orden_version') {
        throw new ConflictException('Ya existe un resumen de cierre para esta orden y versión');
      }
      if (dbError?.code === '40001') {
        throw new ConflictException('La orden cambió durante la preparación del cierre; vuelva a intentarlo');
      }
      throw error;
    }
  }

  async consultar(ordenId: number, cierreVersion = 1): Promise<CierreProduccion> {
    this.validarReferencia(ordenId, cierreVersion);
    const cierre = await this.cierres.findOneBy({ ordenId: String(ordenId), cierreVersion });
    if (cierre) return cierre;
    if (!await this.dataSource.getRepository(OrdenProduccion).existsBy({ id: ordenId })) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }
    throw new NotFoundException(`No existe un resumen de cierre para la orden ${ordenId} y versión ${cierreVersion}`);
  }
}
