import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { CreateResultadoConformeDto } from './dto/create-resultado-conforme.dto';
import { ResultadoConforme } from './entities/resultado-conforme.entity';
import { TipoResultadoCalidad } from './entities/tipo-resultado-calidad.enum';

function unidadesEscaladas(valor: string): bigint {
  const [entero, decimales = ''] = valor.split('.');
  return BigInt(entero) * 10000n + BigInt(decimales.padEnd(4, '0'));
}

@Injectable()
export class CalidadService {
  constructor(
    @InjectRepository(ResultadoConforme)
    private readonly resultadosRepository: Repository<ResultadoConforme>,
    private readonly dataSource: DataSource,
  ) {}

  registrarConforme(dto: CreateResultadoConformeDto, usuarioId: number) {
    return this.registrarResultado({ ...dto, tipo: TipoResultadoCalidad.CONFORME }, usuarioId);
  }

  async registrarResultado(dto: CreateResultadoConformeDto, usuarioId: number) {
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }
    if (!Number.isSafeInteger(dto.ordenId) || dto.ordenId < 1 ||
        !Number.isFinite(dto.cantidad) || dto.cantidad <= 0 || dto.cantidad > 9999999999.9999 ||
        Number(dto.cantidad.toFixed(4)) !== dto.cantidad) {
      throw new BadRequestException('Orden y cantidad deben ser positivas; cantidad admite hasta cuatro decimales');
    }
    const tipo = dto.tipo ?? TipoResultadoCalidad.CONFORME;
    if (!Object.values(TipoResultadoCalidad).includes(tipo)) throw new BadRequestException('Tipo de resultado inválido');
    let causaDefecto: string | null = null;
    if (tipo === TipoResultadoCalidad.DEFECTUOSO) {
      if (typeof dto.causaDefecto !== 'string' || !dto.causaDefecto.trim() || dto.causaDefecto.length > 500) {
        throw new BadRequestException('La causa del defecto es obligatoria y admite hasta 500 caracteres');
      }
      causaDefecto = dto.causaDefecto.trim();
    } else if (dto.causaDefecto !== undefined) {
      throw new BadRequestException('Un resultado conforme no admite causa de defecto');
    }
    return this.dataSource.transaction(async (manager) => {
      const orden = await manager.findOne(OrdenProduccion, {
        where: { id: dto.ordenId }, lock: { mode: 'pessimistic_write' },
      });
      if (!orden) throw new NotFoundException(`Orden con id ${dto.ordenId} no encontrada`);

      const producido = await manager.getRepository(AvancesProduccion).createQueryBuilder('avance')
        .select('COALESCE(SUM(avance.cantidad_producida), 0)::text', 'total')
        .where('avance.orden_id = :ordenId', { ordenId: String(dto.ordenId) })
        .getRawOne<{ total: string }>();
      const clasificado = await manager.getRepository(ResultadoConforme).createQueryBuilder('resultado')
        .select('COALESCE(SUM(resultado.cantidad), 0)::text', 'total')
        .where('resultado.ordenId = :ordenId', { ordenId: String(dto.ordenId) })
        .getRawOne<{ total: string }>();
      if (unidadesEscaladas(clasificado.total) + unidadesEscaladas(dto.cantidad.toFixed(4)) > unidadesEscaladas(producido.total)) {
        throw new ConflictException('Conformes y defectuosos acumulados no pueden superar las unidades producidas según los avances');
      }
      return manager.save(ResultadoConforme, {
        ordenId: String(dto.ordenId), cantidad: dto.cantidad.toFixed(4), responsableUsuarioId: String(usuarioId),
        tipo, causaDefecto,
      });
    });
  }

  consultarConformes(ordenId: number) {
    return this.consultarResultados(ordenId, TipoResultadoCalidad.CONFORME);
  }

  async consultarResultados(ordenId: number, tipo: TipoResultadoCalidad = TipoResultadoCalidad.CONFORME) {
    if (!Number.isSafeInteger(ordenId) || ordenId < 1) throw new BadRequestException('El id de la orden debe ser un entero positivo válido');
    if (!Object.values(TipoResultadoCalidad).includes(tipo)) throw new BadRequestException('Tipo de resultado inválido');
    if (!await this.dataSource.getRepository(OrdenProduccion).existsBy({ id: ordenId })) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }
    return this.resultadosRepository.find({
      where: { ordenId: String(ordenId), tipo }, order: { fechaHora: 'ASC', id: 'ASC' },
    });
  }
}
