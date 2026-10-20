import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CrearBoletaDto } from './dto/crear-boleta.dto';
import { ActualizarBoletaItemsDto } from './dto/actualizar-boleta-items.dto';
import { ListarBoletasDto, PaginatedBoletasResultDto } from './dto/listar-boletas.dto';
import { AnularBoletaDto } from './dto/anular-boleta.dto';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { BoletaEnvioHistorial } from './entities/boleta-envio-historial.entity';
import { EstadoBoleta } from './entities/estado-boleta.enum';
import { esTransicionBoletaValida } from './entities/estado-boleta.transiciones';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { escalarCantidad } from '../disponibilidad-documental/cantidad-documental';

const cantidadEscalada = (cantidad: string): bigint => escalarCantidad(cantidad);

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
    this.validarCantidadesContraSolicitud(solicitud, dto.items);

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
    this.validarCantidadesContraSolicitud(solicitud, dto.items);

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

  async emitir(id: string, usuarioId: string, authorization: string): Promise<BoletaEnvio> {
    if (!/^\d+$/.test(id) || BigInt(id) < BigInt('1') || BigInt(id) > BigInt('9223372036854775807')) {
      throw new NotFoundException('Boleta no encontrada');
    }
    const boleta = await this.boletas.findOne({
      where: { id },
      relations: { items: true, solicitudSalida: { items: true } },
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

    // Cantidad original de cada lote de la orden: base del saldo documental por lote.
    const cantidadPorLote = await this.cantidadPorLoteDeOrden(orden.codigo, ordenId, productoId, authorization);

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
        relations: { items: true, solicitudSalida: { items: true } },
      });
      if (!actual) throw new NotFoundException('Boleta no encontrada');
      if (actual.estado === EstadoBoleta.EMITIDA) return actual;
      if (actual.estado !== EstadoBoleta.BORRADOR) {
        throw new ConflictException('Solo una boleta BORRADOR puede emitirse');
      }
      if (!actual.items || actual.items.length === 0) {
        throw new ConflictException('No se puede emitir una boleta sin ítems');
      }

      const conformes = await this.produccion.consultarConformesPorOrden(ordenId, authorization);
      const totalConforme = conformes.reduce(
        (total, resultado) => total + cantidadEscalada(resultado.cantidad),
        BigInt('0'),
      );
      const compromisos = await this.compromisosPorLote(manager, ordenId);
      const totalEmitido = compromisos.total;
      const solicitado = (actual.items ?? []).reduce(
        (total, item) => total + cantidadEscalada(item.cantidad),
        BigInt('0'),
      );
      if (solicitado > totalConforme - totalEmitido) {
        throw new ConflictException('La cantidad solicitada supera el saldo documental disponible');
      }

      // Saldo individual por lote: no se puede emitir más de lo que el lote tiene.
      const porReferencia = this.cantidadesPorReferencia(actual.items ?? []);
      for (const [referencia, cantidad] of porReferencia) {
        const original = cantidadPorLote.get(referencia);
        if (original === undefined) {
          throw new NotFoundException('Uno o más ítems no pertenecen a la orden solicitada');
        }
        const comprometido = compromisos.porReferencia.get(referencia) ?? BigInt('0');
        if (cantidad + comprometido > original) {
          throw new ConflictException(
            `La cantidad del lote ${referencia} supera el saldo documental disponible del lote`,
          );
        }
      }

      // La boleta tampoco puede superar lo autorizado por su solicitud de salida.
      const autorizadas = this.cantidadesPorReferencia(actual.solicitudSalida?.items ?? []);
      const solicitudId = String(actual.solicitudSalidaId);
      for (const [referencia, cantidad] of porReferencia) {
        const autorizada = autorizadas.get(referencia);
        if (autorizada === undefined) {
          throw new NotFoundException('Uno o más ítems no pertenecen a la solicitud de salida');
        }
        const comprometido = compromisos.porSolicitud.get(`${solicitudId}|${referencia}`) ?? BigInt('0');
        if (cantidad + comprometido > autorizada) {
          throw new ConflictException(
            `La cantidad del lote ${referencia} supera la cantidad autorizada en la solicitud de salida`,
          );
        }
      }

      actual.estado = EstadoBoleta.EMITIDA;
      actual.responsableUsuarioId = usuarioId;
      return manager.save(BoletaEnvio, actual);
    });
  }

  /**
   * Cantidad original de cada lote de la orden, tomada de Producción. Si Producción
   * devuelve lotes de otra orden o de otro producto, la emisión se detiene.
   */
  private async cantidadPorLoteDeOrden(
    ordenCodigo: string,
    ordenId: string,
    productoId: string,
    authorization: string,
  ): Promise<Map<string, bigint>> {
    const lotes = await this.produccion.consultarPorOrden(ordenCodigo, authorization);
    const lotesDeOrden = lotes.filter((lote) => String(lote.ordenId) === ordenId);
    if (lotesDeOrden.length !== lotes.length) {
      throw new BadGatewayException('Producción devolvió un lote de otra orden');
    }
    if (lotesDeOrden.some((lote) => String(lote.productoId) !== productoId)) {
      throw new BadGatewayException('Producción devolvió un lote de otro producto');
    }
    const cantidadPorLote = new Map<string, bigint>();
    for (const lote of lotesDeOrden) {
      cantidadPorLote.set(
        lote.codigo,
        escalarCantidad(lote.cantidad, 'Producción devolvió un lote con cantidad inválida'),
      );
    }
    return cantidadPorLote;
  }

  /**
   * Cantidad comprometida por las boletas EMITIDAS de la orden: total, por lote y
   * por lote dentro de cada solicitud de salida. Los borradores no comprometen nada
   * y las boletas anuladas dejan de hacerlo.
   */
  private async compromisosPorLote(
    manager: EntityManager,
    ordenId: string,
  ): Promise<{ total: bigint; porReferencia: Map<string, bigint>; porSolicitud: Map<string, bigint> }> {
    const filas = await manager.query(
      `SELECT boleta.solicitud_salida_id AS solicitud_id,
              item.referencia AS referencia,
              COALESCE(SUM(item.cantidad), 0)::text AS total
         FROM boletas_envio boleta
         INNER JOIN boletas_envio_items item ON item.boleta_id = boleta.id
         INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
        WHERE solicitud.orden_id = $1 AND boleta.estado = $2
        GROUP BY boleta.solicitud_salida_id, item.referencia`,
      [ordenId, EstadoBoleta.EMITIDA],
    ) as Array<{ solicitud_id: string; referencia: string; total: string }>;

    const porReferencia = new Map<string, bigint>();
    const porSolicitud = new Map<string, bigint>();
    let total = BigInt('0');
    for (const fila of filas ?? []) {
      const comprometido = cantidadEscalada(fila?.total ?? '0');
      total += comprometido;
      const referencia = String(fila?.referencia ?? '').trim();
      porReferencia.set(referencia, (porReferencia.get(referencia) ?? BigInt('0')) + comprometido);
      const clave = `${String(fila?.solicitud_id ?? '')}|${referencia}`;
      porSolicitud.set(clave, (porSolicitud.get(clave) ?? BigInt('0')) + comprometido);
    }
    return { total, porReferencia, porSolicitud };
  }

  /** Suma las cantidades de los ítems agrupadas por referencia de lote. */
  private cantidadesPorReferencia(items: Array<{ referencia: string; cantidad: string }>): Map<string, bigint> {
    const mapa = new Map<string, bigint>();
    for (const item of items ?? []) {
      const referencia = String(item?.referencia ?? '').trim();
      const cantidad = cantidadEscalada(item?.cantidad);
      mapa.set(referencia, (mapa.get(referencia) ?? BigInt('0')) + cantidad);
    }
    return mapa;
  }

  /**
   * Una boleta no puede incluir una cantidad superior a la solicitada para un lote
   * de su solicitud de salida.
   */
  private validarCantidadesContraSolicitud(
    solicitud: SolicitudSalida,
    items: Array<{ referencia: string; cantidad: string }>,
  ): void {
    const autorizadas = this.cantidadesPorReferencia(solicitud?.items ?? []);
    const solicitadas = new Map<string, bigint>();
    for (const item of items ?? []) {
      const referencia = String(item?.referencia ?? '').trim();
      const autorizada = autorizadas.get(referencia);
      if (autorizada === undefined) {
        throw new NotFoundException('Uno o más ítems no pertenecen a la solicitud de salida');
      }
      const total = (solicitadas.get(referencia) ?? BigInt('0')) + cantidadEscalada(item?.cantidad);
      if (total > autorizada) {
        throw new ConflictException(
          `La cantidad del lote ${referencia} supera la cantidad autorizada en la solicitud de salida`,
        );
      }
      solicitadas.set(referencia, total);
    }
  }

  async anular(id: string, dto: AnularBoletaDto, usuarioId: string): Promise<BoletaEnvio> {
    if (!/^\d+$/.test(id) || BigInt(id) < BigInt('1') || BigInt(id) > BigInt('9223372036854775807')) {
      throw new NotFoundException('Boleta no encontrada');
    }
    if (!usuarioId || !/^\d+$/.test(usuarioId) || BigInt(usuarioId) < BigInt('1') || BigInt(usuarioId) > BigInt('9223372036854775807')) {
      throw new BadRequestException('Identificador de usuario inválido');
    }
    const motivoLimpio = dto?.motivo?.trim();
    if (!motivoLimpio) {
      throw new BadRequestException('El motivo de anulación es obligatorio y no puede estar vacío');
    }

    return this.dataSource.transaction(async (manager) => {
      if (typeof manager.query === 'function') {
        await manager.query(
          `SELECT id FROM boletas_envio WHERE id = $1 FOR UPDATE`,
          [id],
        );
      }

      const boleta = await manager.findOne(BoletaEnvio, {
        where: { id },
        relations: { items: true },
      });

      if (!boleta) {
        throw new NotFoundException('Boleta no encontrada');
      }

      if (!esTransicionBoletaValida(boleta.estado, EstadoBoleta.ANULADA)) {
        if (boleta.estado === EstadoBoleta.ANULADA) {
          throw new ConflictException('La boleta ya se encuentra en estado ANULADA');
        }
        if (boleta.estado === EstadoBoleta.BORRADOR) {
          throw new ConflictException(`Solo se pueden anular boletas en estado EMITIDA (estado actual: ${boleta.estado})`);
        }
        throw new ConflictException(`No se permite anular una boleta en estado ${boleta.estado}`);
      }

      const estadoAnterior = boleta.estado;
      boleta.estado = EstadoBoleta.ANULADA;

      const historial = manager.create
        ? manager.create(BoletaEnvioHistorial, {
            boletaId: boleta.id,
            estadoAnterior,
            estadoNuevo: EstadoBoleta.ANULADA,
            usuarioActorId: usuarioId,
            motivo: motivoLimpio,
          })
        : Object.assign(new BoletaEnvioHistorial(), {
            boletaId: boleta.id,
            estadoAnterior,
            estadoNuevo: EstadoBoleta.ANULADA,
            usuarioActorId: usuarioId,
            motivo: motivoLimpio,
          });

      await manager.save(BoletaEnvioHistorial, historial);
      return manager.save(BoletaEnvio, boleta);
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

    qb.orderBy('boleta.creadoEn', 'DESC')
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
    const boleta = await this.boletas.findOne({
      where: { id },
      relations: { items: true, historial: true },
      order: { historial: { fechaHora: 'ASC', id: 'ASC' } },
    });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    return boleta;
  }
}
