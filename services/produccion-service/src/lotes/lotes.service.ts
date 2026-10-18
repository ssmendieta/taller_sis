import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { TipoResultadoCalidad } from '../calidad/entities/tipo-resultado-calidad.enum';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Lote } from './entities/lote.entity';

export interface CrearLoteInput {
  ordenId: number;
  codigo: string;
  cantidad: number;
}

function unidadesEscaladas(valor: string): bigint {
  const [entero, decimales = ''] = valor.split('.');
  return BigInt(entero) * 10000n + BigInt(decimales.padEnd(4, '0'));
}

@Injectable()
export class LotesService {
  constructor(private readonly dataSource: DataSource) {}

  async findByOrderCode(ordenCodigo: string) {
    const codigo = typeof ordenCodigo === 'string' ? ordenCodigo.trim() : '';
    if (!codigo || codigo.length > 50) {
      throw new BadRequestException('El código de orden es obligatorio');
    }
    const lotes = await this.dataSource.getRepository(Lote)
      .createQueryBuilder('lote')
      .innerJoinAndSelect('lote.orden', 'orden')
      .where('orden.codigo = :codigo', { codigo })
      .orderBy('lote.id', 'ASC')
      .getMany();
    return lotes.map((lote) => ({
      id: String(lote.id),
      codigo: lote.codigo,
      ordenId: String(lote.ordenId),
      ordenCodigo: lote.orden.codigo,
      productoId: String(lote.orden.producto_id),
      cantidad: lote.cantidad,
      responsableUsuarioId: String(lote.responsableUsuarioId),
      fechaHora: lote.fechaHora,
    }));
  }

  async create(dto: CrearLoteInput, usuarioId: number): Promise<Lote> {
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }
    if (!Number.isSafeInteger(dto.ordenId) || dto.ordenId < 1 ||
        !Number.isFinite(dto.cantidad) || dto.cantidad <= 0 || dto.cantidad > 9999999999.9999 ||
        Number(dto.cantidad.toFixed(4)) !== dto.cantidad) {
      throw new BadRequestException('Orden y cantidad deben ser positivas; cantidad admite hasta cuatro decimales');
    }
    if (typeof dto.codigo !== 'string' || !dto.codigo.trim() || dto.codigo.trim().length > 80) {
      throw new BadRequestException('El código de lote es obligatorio y admite hasta 80 caracteres');
    }
    const codigo = dto.codigo.trim();

    try {
      return await this.dataSource.transaction(async (manager) => {
        const orden = await manager.findOne(OrdenProduccion, {
          where: { id: dto.ordenId }, lock: { mode: 'pessimistic_write' },
        });
        if (!orden) throw new NotFoundException(`Orden con id ${dto.ordenId} no encontrada`);

        const lotes = manager.getRepository(Lote);
        if (await lotes.existsBy({ codigo })) {
          throw new ConflictException('Ya existe un lote con este código');
        }
        const conformes = await manager.getRepository(ResultadoConforme).createQueryBuilder('resultado')
          .select('COALESCE(SUM(resultado.cantidad), 0)::text', 'total')
          .where('resultado.ordenId = :ordenId', { ordenId: String(dto.ordenId) })
          .andWhere('resultado.tipo = :tipo', { tipo: TipoResultadoCalidad.CONFORME })
          .getRawOne<{ total: string }>();
        const asignados = await lotes.createQueryBuilder('lote')
          .select('COALESCE(SUM(lote.cantidad), 0)::text', 'total')
          .where('lote.ordenId = :ordenId', { ordenId: String(dto.ordenId) })
          .getRawOne<{ total: string }>();
        if (unidadesEscaladas(asignados.total) + unidadesEscaladas(dto.cantidad.toFixed(4)) > unidadesEscaladas(conformes.total)) {
          throw new ConflictException('La cantidad supera los conformes disponibles sin asignar de la orden');
        }
        return manager.save(Lote, {
          codigo, ordenId: String(dto.ordenId), cantidad: dto.cantidad.toFixed(4),
          responsableUsuarioId: String(usuarioId),
        });
      });
    } catch (error) {
      const dbError = error?.driverError ?? error;
      if (dbError?.code === '23505' && dbError.constraint === 'uq_lotes_codigo') {
        throw new ConflictException('Ya existe un lote con este código');
      }
      throw error;
    }
  }
}
