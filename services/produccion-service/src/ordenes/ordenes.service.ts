import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';
import { EstadoOrden } from './estado-orden.enum';
import { esTransicionValida } from './estado-orden.transiciones';
import { CambiarEstadoOrdenDto } from './cambiar-estado-orden.dto';
import { CreateOrdenDto } from './dto/create-orden.dto';
import { Inventario } from '../inventario/entities/inventario.entity';
import { RecetasService } from '../recetas/recetas.service';
import { multiplicarMateriales } from '../material-calculation/material-calculation.service';

// Identidad verificada por PermisoProduccionGuard (decide solo por permiso).
export interface UsuarioAutenticadoProduccion {
  sub: string | number;
  rolNombre: string;
  nombre?: string | null;
}

function hoyLocal(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

function nombreVisible(nombre: string | null | undefined, id: string | number): string {
  const limpio = typeof nombre === 'string' ? nombre.trim() : '';
  return limpio || `Usuario #${id}`;
}

@Injectable()
export class OrdenesService {
  constructor(
    @InjectRepository(OrdenProduccion)
    private readonly ordenRepository: Repository<OrdenProduccion>,
    @InjectRepository(HistorialEstadoOrden)
    private readonly historialRepository: Repository<HistorialEstadoOrden>,
    @InjectRepository(Inventario)
    private readonly inventarioRepository: Repository<Inventario>,
    private readonly recetasService: RecetasService,
  ) {}

  async create(
    createOrdenDto: CreateOrdenDto,
    usuarioAutenticado?: UsuarioAutenticadoProduccion,
  ): Promise<OrdenProduccion> {
    const responsableId = Number(usuarioAutenticado?.sub);
    if (!Number.isSafeInteger(responsableId) || responsableId < 1) {
      throw new UnauthorizedException('Debe iniciar sesión para crear órdenes');
    }
    const cantidad = Number(createOrdenDto.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a cero');
    }
    if (!/^\d+(\.\d{1,4})?$/.test(String(createOrdenDto.cantidad))) {
      throw new BadRequestException('La cantidad admite como máximo 4 decimales');
    }
    const fecha = String(createOrdenDto.fecha_programada ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Debe proporcionar una fecha programada válida');
    }
    if (fecha < hoyLocal()) {
      throw new BadRequestException('La fecha programada no puede ser anterior a hoy');
    }
    const recetaId = Number(createOrdenDto.producto_id);
    if (!Number.isSafeInteger(recetaId) || recetaId < 1) {
      throw new BadRequestException('El producto es obligatorio y debe ser un ID válido');
    }
    let receta;
    try {
      receta = await this.recetasService.findOne(recetaId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`Receta con id ${recetaId} no encontrada`);
      }
      throw new BadRequestException('La receta indicada no es válida');
    }
    if (!receta.activa) {
      throw new ConflictException('La receta indicada está inactiva');
    }

    const nombre = nombreVisible(usuarioAutenticado?.nombre, responsableId);
    for (let intento = 0; intento < 2; intento += 1) {
      const codigo = await this.generarCodigo();
      try {
        return await this.ordenRepository.manager.transaction(async (manager) => {
          const orden = await manager.save(
            OrdenProduccion,
            manager.create(OrdenProduccion, {
              codigo,
              producto_id: recetaId,
              cantidad,
              fecha_programada: fecha,
              estado: 'PENDIENTE',
              responsable_id: responsableId,
              responsable_nombre: nombre,
            }),
          );
          await manager.save(
            HistorialEstadoOrden,
            manager.create(HistorialEstadoOrden, {
              ordenId: orden.id,
              estadoAnterior: null,
              estadoNuevo: 'PENDIENTE',
              usuarioResponsableId: responsableId,
              usuarioResponsableNombre: nombre,
              motivo: null,
            }),
          );
          return orden;
        });
      } catch (error) {
        const constraint = (error as { driverError?: { constraint?: string; code?: string } })?.driverError;
        if (constraint?.constraint === 'ordenes_produccion_codigo_key' || constraint?.code === '23505') {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('No se pudo generar un código de orden único, intente de nuevo');
  }

  private async generarCodigo(): Promise<string> {
    const filas = (await this.ordenRepository.query(
      `SELECT nextval('secuencia_codigo_orden') AS n`,
    )) as Array<{ n: string }>;
    const numero = String(filas[0]?.n ?? '1').padStart(5, '0');
    return `ORD-${new Date().getFullYear()}-${numero}`;
  }

  async findAll(): Promise<OrdenProduccion[]> {
    return this.ordenRepository.find();
  }

  async findByCodigo(codigo: string): Promise<OrdenProduccion> {
    const orden = await this.ordenRepository.findOne({
      where: { codigo },
    });

    if (!orden) {
      throw new NotFoundException(`Orden con código ${codigo} no encontrada`);
    }

    return orden;
  }

  // Detalle de una orden: producto, cantidades, responsable, fechas y avance.
  async obtenerDetalle(id: number) {
    const orden = await this.ordenRepository.findOne({ where: { id } });
    if (!orden) {
      throw new NotFoundException(`Orden con id ${id} no encontrada`);
    }
    const receta = await this.recetasService.findOne(orden.producto_id).catch(() => null);    const filas = (await this.ordenRepository.query(
      `SELECT COALESCE(SUM(cantidad_producida), 0) AS acumulado
       FROM avances_produccion WHERE orden_id = $1`,
      [id],
    )) as Array<{ acumulado: string | number }>;
    const acumulado = Number(filas[0]?.acumulado ?? 0);
    const solicitada = Number(orden.cantidad);
    return {
      ...orden,
      producto: receta
        ? {
            codigo: receta.productoCodigo ?? receta.producto_codigo,
            nombre: receta.productoNombre ?? receta.producto_nombre,
          }
        : null,
      cantidad_solicitada: solicitada,
      responsable: {
        id: orden.responsable_id,
        nombre: nombreVisible(orden.responsable_nombre, orden.responsable_id),
      },
      avance: {
        acumulado,
        pendiente: Math.max(solicitada - acumulado, 0),
      },
    };
  }

  async obtenerMateriales(id: number) {
    const orden = await this.ordenRepository.findOne({ where: { id } });
    if (!orden) {
      throw new NotFoundException(`Orden con id ${id} no encontrada`);
    }
    const lineas = (await this.ordenRepository.query(
      `
      SELECT
        m.id AS material_id,
        m.codigo AS material_codigo,
        m.nombre AS material_nombre,
        m.unidad_medida AS unidad_medida,
        rm.cantidad_requerida AS cantidad_requerida
      FROM ordenes_produccion o
      INNER JOIN receta_material rm ON rm.receta_id = o.receta_id
      INNER JOIN materiales m ON m.id = rm.material_id
      WHERE o.id = $1
    `,
      [id],
    )) as Array<{
      material_id: number;
      material_codigo: string;
      material_nombre: string;
      unidad_medida: string;
      cantidad_requerida: string | number;
    }>;
    const calculados = multiplicarMateriales(
      Number(orden.cantidad),
      lineas.map((l) => ({
        materialId: Number(l.material_id),
        materialCodigo: l.material_codigo,
        materialNombre: l.material_nombre,
        unidadMedida: l.unidad_medida,
        cantidadRequerida: Number(l.cantidad_requerida),
      })),
    );
    return {
      orden_id: orden.id,
      orden_codigo: orden.codigo,
      cantidad_solicitada: Number(orden.cantidad),
      materiales: calculados.map((m) => ({
        material_id: m.materialId,
        codigo: m.materialCodigo,
        nombre: m.materialNombre,
        unidad_medida: m.unidadMedida,
        cantidad_requerida: m.cantidadTotal,
        cantidadTotal: m.cantidadTotal,
      })),
    };
  }

  async buscar(filtros: {
    estado?: string;
    producto?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    fecha?: string;
  }) {
    const estado = filtros.estado?.trim() || null;
    const producto = filtros.producto?.trim() || null;
    const desde = (filtros.fechaDesde ?? filtros.fecha)?.trim().slice(0, 10) || null;
    const hasta = (filtros.fechaHasta ?? filtros.fecha)?.trim().slice(0, 10) || null;

    return this.ordenRepository.query(
      `
      SELECT o.id::text AS id,
             o.codigo,
             r.producto_codigo,
             r.producto_nombre,
             o.cantidad_solicitada::text AS cantidad_solicitada,
             o.fecha_programada::text AS fecha_programada,
             o.estado,
             o.responsable_usuario_id::text AS responsable_usuario_id,
             COALESCE(o.responsable_nombre, 'Usuario #' || o.responsable_usuario_id) AS responsable_nombre
      FROM ordenes_produccion o
      JOIN recetas r ON r.id = o.receta_id
      WHERE ($1::text IS NULL OR o.estado = $1)
        AND ($2::text IS NULL OR r.producto_nombre ILIKE '%' || $2 || '%'
             OR r.producto_codigo ILIKE '%' || $2 || '%')
        AND ($3::date IS NULL OR o.fecha_programada >= $3::date)
        AND ($4::date IS NULL OR o.fecha_programada <= $4::date)
      ORDER BY o.fecha_programada DESC, o.id DESC
    `,
      [estado, producto, desde, hasta],
    );
  }

  async compararDisponibilidadMateriales(id: number) {
    const orden = await this.ordenRepository.findOne({
      where: { id },
    });

    if (!orden) {
      throw new NotFoundException(`Orden ${id} no encontrada`);
    }

    const materiales = await this.ordenRepository.query(
      `
      SELECT
        m.id AS material_id,
        m.codigo,
        m.nombre,
        m.unidad_medida,
        rm.cantidad_requerida
      FROM ordenes_produccion o
      INNER JOIN receta_material rm
        ON rm.receta_id = o.receta_id
      INNER JOIN materiales m
        ON m.id = rm.material_id
      WHERE o.id = $1
      `,
      [id],
    );

    const resultado = [];

    for (const material of materiales) {
      const cantidadRequerida =
        Number(material.cantidad_requerida) * Number(orden.cantidad);

      const inventario = await this.inventarioRepository.findOne({
        where: {
          materialId: Number(material.material_id),
        },
      });

      const cantidadDisponible = inventario
        ? Number(inventario.cantidadDisponible)
        : 0;

      let estado: string;

      if (!inventario || cantidadDisponible === 0) {
        estado = 'FALTANTE';
      } else if (cantidadDisponible < cantidadRequerida) {
        estado = 'INSUFICIENTE';
      } else {
        estado = 'DISPONIBLE';
      }

      resultado.push({
        material_id: Number(material.material_id),
        codigo: material.codigo,
        nombre: material.nombre,
        unidad_medida: material.unidad_medida,
        cantidad_requerida: cantidadRequerida,
        cantidad_disponible: cantidadDisponible,
        estado,
      });
    }

    return {
      orden_id: orden.id,
      orden_codigo: orden.codigo,
      cantidad_producir: Number(orden.cantidad),
      materiales: resultado,
    };
  }


  async cambiarEstado(
    id: number,
    dto: CambiarEstadoOrdenDto,
    usuarioAutenticado?: UsuarioAutenticadoProduccion,
  ) {
    if (dto.nuevoEstado === EstadoOrden.CANCELADA && !dto.motivo?.trim()) {
      throw new BadRequestException('Debe indicar el motivo de cancelación');
    }
    const responsableId = Number(
      usuarioAutenticado?.sub ?? dto.usuarioResponsableId,
    );
    if (!Number.isSafeInteger(responsableId) || responsableId < 1) {
      throw new BadRequestException('Usuario responsable inválido');
    }
    dto = { ...dto, usuarioResponsableId: responsableId };

    const esInicio = dto.nuevoEstado === EstadoOrden.EN_PRODUCCION;

    const orden = await this.ordenRepository.findOne({
      where: { id },
    });


    if (!orden) {
      throw new NotFoundException(`Orden con id ${id} no encontrada`);
    }



    if (!Object.values(EstadoOrden).includes(dto.nuevoEstado)) {
      throw new BadRequestException(
        `Estado solicitado inválido: '${dto.nuevoEstado}'. Valores válidos: ${Object.values(EstadoOrden).join(', ')}`,
      );
    }

    if (dto.nuevoEstado === EstadoOrden.CANCELADA) {
      const motivo = dto.motivo?.trim();
      if (!motivo) {
        throw new BadRequestException(
          'Debe proporcionar un motivo no vacío para cancelar la orden.',
        );
      }
      dto = { ...dto, motivo };
    }


    const estadoActual = orden.estado as EstadoOrden;

    if (esInicio && estadoActual !== EstadoOrden.PLANIFICADA) {
      throw new BadRequestException(
        `La orden ${id} debe estar en '${EstadoOrden.PLANIFICADA}' para iniciar; estado actual: '${estadoActual}'.`,
      );
    }

    if (esInicio) {
      const receta = await this.recetasService.findOne(orden.producto_id);
      if (!receta.activa) {
        throw new ConflictException({
          message: 'No se puede iniciar la orden porque su receta está inactiva.',
          orden_id: id,
          receta_id: orden.producto_id,
        });
      }

      const disponibilidad = await this.compararDisponibilidadMateriales(id);
      const materialesFaltantes = disponibilidad.materiales.filter(
        (material) => material.estado === 'INSUFICIENTE' || material.estado === 'FALTANTE',
      );

      if (materialesFaltantes.length > 0) {
        throw new ConflictException({
          message: 'No se puede iniciar la orden porque faltan materiales.',
          orden_id: id,
          materiales_faltantes: materialesFaltantes,
        });
      }
    }

    if (!esTransicionValida(estadoActual, dto.nuevoEstado)) {
      throw new BadRequestException(
        `Transición no permitida: la orden ${id} está en '${estadoActual}' y no puede pasar a '${dto.nuevoEstado}'`,
      );
    }


    const nombre = nombreVisible(usuarioAutenticado?.nombre, responsableId);
    const actualizada = await this.ordenRepository.manager.transaction(
      async (manager) => {

        orden.estado = dto.nuevoEstado;

        if (dto.nuevoEstado === EstadoOrden.EN_PRODUCCION) {
          orden.iniciada_en = new Date();
        }

        if (dto.nuevoEstado === EstadoOrden.FINALIZADA) {
          orden.finalizada_en = new Date();
        }

        if (dto.nuevoEstado === EstadoOrden.CANCELADA) {
          orden.cancelada_en = new Date();
        }

        await manager.save(OrdenProduccion, orden);

        await manager.save(
          HistorialEstadoOrden,
          manager.create(HistorialEstadoOrden, {
            ordenId: id,
            estadoAnterior: estadoActual,
            estadoNuevo: dto.nuevoEstado,
            usuarioResponsableId: responsableId,
            usuarioResponsableNombre: nombre,
            motivo: dto.motivo?.trim() ?? null,
          }),
        );

        return manager.findOne(OrdenProduccion, {
          where: { id },
        });

      },
    );


    return actualizada;


  }


  async obtenerHistorial(ordenId: number) {
    const orden = await this.ordenRepository.findOne({
      where: { id: ordenId },
    });


    if (!orden) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }

    const filas = await this.historialRepository.find({
      where: { ordenId },
      order: {
        fechaHora: 'DESC',
        id: 'DESC',
      },
    });
    return filas.map((fila) => {
      const actual = fila as unknown as Record<string, unknown>;
      const nombre =
        actual.usuarioResponsableNombre ?? actual.usuario_responsable_nombre;
      if (nombre !== null && nombre !== undefined) {
        return { ...actual, usuario_responsable_nombre: nombre };
      }
      const idResponsable =
        actual.usuarioResponsableId ?? actual.usuario_responsable_id;
      if (idResponsable === null || idResponsable === undefined) {
        return actual;
      }
      return {
        ...actual,
        usuario_responsable_nombre: `Usuario #${idResponsable}`,
      };
    });
  }
}
