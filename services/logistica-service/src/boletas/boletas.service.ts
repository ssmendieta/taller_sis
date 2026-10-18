import { BadGatewayException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CrearBoletaDto } from './dto/crear-boleta.dto';
import { ActualizarBoletaItemsDto } from './dto/actualizar-boleta-items.dto';
import { ListarBoletasDto, PaginatedBoletasResultDto } from './dto/listar-boletas.dto';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { EstadoBoleta } from './entities/estado-boleta.enum';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';

const ESCALA_CANTIDAD = BigInt('10000');

function cantidadEscalada(cantidad: string): bigint {
  if (!/^\d+(?:\.\d{1,4})?$/.test(cantidad)) {
    throw new BadGatewayException('Cantidad documental inválida');
  }
  const [entero, decimales = ''] = cantidad.split('.');
  return BigInt(entero) * ESCALA_CANTIDAD + BigInt(decimales.padEnd(4, '0'));
}

@Injectable()
export class BoletasService {
  constructor(
    @InjectRepository(BoletaEnvio) private readonly boletas: Repository<BoletaEnvio>,
    @InjectRepository(SolicitudSalida) private readonly solicitudes: Repository<SolicitudSalida>,
    private readonly dataSource: DataSource,
    private readonly produccion: LotesProduccionClient,
  ) {}

  async create(dto: CrearBoletaDto, usuarioId: string, authorization: string): Promise<BoletaEnvio> {
    const solicitud = await this.solicitudes.findOne({
      where: { id: dto.solicitudSalidaId },
      relations: { items: true },
    });
    if (!solicitud) throw new NotFoundException('Solicitud de salida no encontrada');

    const orden = await this.produccion.consultarOrdenPorId(solicitud.ordenId, authorization);
    if (String(orden.id) !== String(solicitud.ordenId) || !orden.codigo.trim() ||
        !Number.isSafeInteger(Number(orden.producto_id)) || Number(orden.producto_id) < 1 ||
        !orden.producto || typeof orden.producto !== 'object') {
      throw new BadGatewayException('Producción devolvió una relación orden-producto incompleta');
    }
    const solicitudReferencias = new Set((solicitud.items ?? []).map((item) => item.referencia));
    if (dto.items.some((item) => !solicitudReferencias.has(item.referencia))) {
      throw new NotFoundException('Uno o más ítems no pertenecen a la solicitud de salida');
    }
    const lotes = await this.produccion.consultarPorOrden(orden.codigo, authorization);
    const lotesDeOrden = lotes.filter((lote) => String(lote.ordenId) === String(solicitud.ordenId));
    if (lotesDeOrden.length !== lotes.length) {
      throw new BadGatewayException('Producción devolvió un lote de otra orden');
    }
    if (lotesDeOrden.some((lote) => String(lote.productoId) !== String(orden.producto_id))) {
      throw new BadGatewayException('Producción devolvió un lote de otro producto');
    }
    const referencias = new Set(lotesDeOrden.map((lote) => lote.codigo));
    if (dto.items.some((item) => !referencias.has(item.referencia))) {
      throw new NotFoundException('Uno o más ítems no pertenecen a la orden solicitada');
    }

    return this.dataSource.transaction(async (manager) => {
      const boleta = await manager.save(BoletaEnvio, manager.create(BoletaEnvio, {
        solicitudSalidaId: solicitud.id,
        responsableUsuarioId: usuarioId,
        estado: EstadoBoleta.BORRADOR,
      }));
      const items = dto.items.map((item) => manager.create(BoletaEnvioItem, {
        boletaId: boleta.id,
        referencia: item.referencia,
        cantidad: item.cantidad,
      }));
      boleta.items = await manager.save(BoletaEnvioItem, items);
      return boleta;
    });
  }

  async updateItems(id: string, dto: ActualizarBoletaItemsDto, _usuarioId: string, authorization: string): Promise<BoletaEnvio> {
    if (!/^\d+$/.test(id) || BigInt(id) < BigInt('1') || BigInt(id) > BigInt('9223372036854775807')) {
      throw new NotFoundException('Boleta no encontrada');
    }
    const boleta = await this.boletas.findOne({ where: { id }, relations: { items: true } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');

    if (boleta.estado !== EstadoBoleta.BORRADOR) {
      throw new ConflictException(`Solo se pueden editar boletas en estado BORRADOR (estado actual: ${boleta.estado})`);
    }

    const solicitud = await this.solicitudes.findOne({
      where: { id: boleta.solicitudSalidaId },
      relations: { items: true },
    });
    if (!solicitud) throw new NotFoundException('Solicitud de salida no encontrada');

    const orden = await this.produccion.consultarOrdenPorId(solicitud.ordenId, authorization);
    if (String(orden.id) !== String(solicitud.ordenId) || !orden.codigo.trim() ||
        !Number.isSafeInteger(Number(orden.producto_id)) || Number(orden.producto_id) < 1 ||
        !orden.producto || typeof orden.producto !== 'object') {
      throw new BadGatewayException('Producción devolvió una relación orden-producto incompleta');
    }
    const solicitudReferencias = new Set((solicitud.items ?? []).map((item) => item.referencia));
    if (dto.items.some((item) => !solicitudReferencias.has(item.referencia))) {
      throw new NotFoundException('Uno o más ítems no pertenecen a la solicitud de salida');
    }
    const lotes = await this.produccion.consultarPorOrden(orden.codigo, authorization);
    const lotesDeOrden = lotes.filter((lote) => String(lote.ordenId) === String(solicitud.ordenId));
    if (lotesDeOrden.length !== lotes.length) {
      throw new BadGatewayException('Producción devolvió un lote de otra orden');
    }
    if (lotesDeOrden.some((lote) => String(lote.productoId) !== String(orden.producto_id))) {
      throw new BadGatewayException('Producción devolvió un lote de otro producto');
    }
    const referencias = new Set(lotesDeOrden.map((lote) => lote.codigo));
    if (dto.items.some((item) => !referencias.has(item.referencia))) {
      throw new NotFoundException('Uno o más ítems no pertenecen a la orden solicitada');
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(BoletaEnvioItem, { boletaId: boleta.id });
      const items = dto.items.map((item) => manager.create(BoletaEnvioItem, {
        boletaId: boleta.id,
        referencia: item.referencia,
        cantidad: item.cantidad,
      }));
      boleta.items = await manager.save(BoletaEnvioItem, items);
      return boleta;
    });
  }

  async emitir(id: string, _usuarioId: string, authorization: string): Promise<BoletaEnvio> {
    if (!/^\d+$/.test(id) || BigInt(id) < BigInt('1') || BigInt(id) > BigInt('9223372036854775807')) {
      throw new NotFoundException('Boleta no encontrada');
    }
    const boleta = await this.boletas.findOne({
      where: { id },
      relations: { items: true, solicitudSalida: true },
    });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    if (!boleta.solicitudSalida?.ordenId) {
      throw new BadGatewayException('La boleta no tiene una orden asociada');
    }

    const orden = await this.produccion.consultarOrdenPorId(boleta.solicitudSalida.ordenId, authorization);
    if (String(orden.id) !== String(boleta.solicitudSalida.ordenId) || !orden.codigo?.trim() ||
        !Number.isSafeInteger(Number(orden.producto_id)) || Number(orden.producto_id) < 1 ||
        !orden.producto || typeof orden.producto !== 'object') {
      throw new BadGatewayException('Producción devolvió una relación orden-producto incompleta');
    }
    const ordenId = String(orden.id);
    const productoId = String(orden.producto_id);

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO boleta_emision_bloqueos (orden_id, producto_id)
         VALUES ($1, $2)
         ON CONFLICT (orden_id, producto_id) DO NOTHING`,
        [ordenId, productoId],
      );
      await manager.query(
        `SELECT orden_id
           FROM boleta_emision_bloqueos
          WHERE orden_id = $1 AND producto_id = $2
          FOR UPDATE`,
        [ordenId, productoId],
      );

      const actual = await manager.findOne(BoletaEnvio, {
        where: { id },
        relations: { items: true, solicitudSalida: true },
      });
      if (!actual) throw new NotFoundException('Boleta no encontrada');
      if (actual.estado === EstadoBoleta.EMITIDA) return actual;
      if (actual.estado !== EstadoBoleta.BORRADOR) {
        throw new ConflictException('Solo una boleta BORRADOR puede emitirse');
      }

      const conformes = await this.produccion.consultarConformesPorOrden(ordenId, authorization);
      const totalConforme = conformes.reduce(
        (total, resultado) => total + cantidadEscalada(resultado.cantidad),
        BigInt('0'),
      );
      const [compromiso] = await manager.query(
        `SELECT COALESCE(SUM(item.cantidad), 0)::text AS total
           FROM boletas_envio boleta
           INNER JOIN boletas_envio_items item ON item.boleta_id = boleta.id
           INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
          WHERE solicitud.orden_id = $1 AND boleta.estado = $2`,
        [ordenId, EstadoBoleta.EMITIDA],
      ) as Array<{ total: string }>;
      const totalEmitido = cantidadEscalada(compromiso?.total ?? '0');
      const solicitado = (actual.items ?? []).reduce(
        (total, item) => total + cantidadEscalada(item.cantidad),
        BigInt('0'),
      );
      if (solicitado > totalConforme - totalEmitido) {
        throw new ConflictException('La cantidad solicitada supera el saldo documental disponible');
      }

      actual.estado = EstadoBoleta.EMITIDA;
      return manager.save(BoletaEnvio, actual);
    });
  }

  async findAll(query: ListarBoletasDto = {}, authorization = ''): Promise<PaginatedBoletasResultDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    let filtroOrdenId: string | undefined = query.ordenId;
    const ordenParam = query.orden ?? query.ordenId;

    if (ordenParam) {
      if (/^\d+$/.test(ordenParam.trim())) {
        filtroOrdenId = ordenParam.trim();
      } else {
        try {
          const ordenDto = await this.produccion.consultarOrdenPorCodigo(ordenParam.trim(), authorization);
          filtroOrdenId = String(ordenDto.id);
        } catch (error) {
          if (error instanceof NotFoundException) {
            return {
              items: [],
              total: 0,
              page,
              limit,
              totalPages: 0,
            };
          }
          throw error;
        }
      }
    }

    const qb = this.boletas.createQueryBuilder('boleta')
      .leftJoinAndSelect('boleta.items', 'item')
      .leftJoinAndSelect('boleta.solicitudSalida', 'solicitud');

    if (filtroOrdenId) {
      qb.andWhere('solicitud.orden_id = :ordenId', { ordenId: filtroOrdenId });
    }

    if (query.estado) {
      qb.andWhere('boleta.estado = :estado', { estado: query.estado });
    }

    if (query.fechaDesde) {
      qb.andWhere('boleta.creado_en >= :fechaDesde', { fechaDesde: query.fechaDesde });
    }

    if (query.fechaHasta) {
      qb.andWhere('boleta.creado_en <= :fechaHasta', { fechaHasta: query.fechaHasta });
    }

    qb.orderBy('boleta.creado_en', 'DESC')
      .addOrderBy('boleta.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<BoletaEnvio> {
    if (!/^\d+$/.test(id) || BigInt(id) < BigInt('1') || BigInt(id) > BigInt('9223372036854775807')) {
      throw new NotFoundException('Boleta no encontrada');
    }
    const boleta = await this.boletas.findOne({ where: { id }, relations: { items: true } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    return boleta;
  }
}