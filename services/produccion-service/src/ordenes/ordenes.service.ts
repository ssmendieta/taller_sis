import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';

import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';
import { EstadoOrden } from './estado-orden.enum';
import { esTransicionValida } from './estado-orden.transiciones';
import { CambiarEstadoOrdenDto } from './cambiar-estado-orden.dto';
import { CreateOrdenDto } from './dto/create-orden.dto';
import { Inventario } from '../inventario/entities/inventario.entity';
import { RecetasService } from '../recetas/recetas.service';

// Este principal debe provenir de autenticación verificada; el controlador
// actual no lo proporciona hasta que ABC-151 integre Production Service.
export interface UsuarioAutenticadoProduccion {
  sub: string | number;
  rolNombre: string;
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

  async create(createOrdenDto: CreateOrdenDto): Promise<OrdenProduccion> {
    
    const codigo = `ORD-${randomUUID().replace(/-/g, '')}`;

    const nuevaOrden = this.ordenRepository.create({
      ...createOrdenDto,
      codigo,
      estado: 'PENDIENTE',
    });

    return await this.ordenRepository.save(nuevaOrden);
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

  // Detalle de una orden por id (ABC-187, aporte de ramagemina).
  async obtenerDetalle(id: number): Promise<OrdenProduccion> {
    const orden = await this.ordenRepository.findOne({
      where: { id },
    });

    if (!orden) {
      throw new NotFoundException(`Orden con id ${id} no encontrada`);
    }

    return orden;
  }

  async obtenerMateriales(id: number) {
    // La receta define la cantidad por unidad; el total que necesita la
    // orden es esa cantidad multiplicada por la cantidad solicitada
    // (misma regla que compararDisponibilidadMateriales). Se conserva el
    // alias 'cantidad_requerida' por compatibilidad con los consumidores.
    const resultado = await this.ordenRepository.query(`
      SELECT
        o.id AS orden_id,
        o.codigo AS orden_codigo,
        m.codigo,
        m.nombre,
        m.unidad_medida,
        ROUND(rm.cantidad_requerida * o.cantidad_solicitada, 4) AS cantidad_requerida
      FROM ordenes_produccion o
      INNER JOIN receta_material rm ON rm.receta_id = o.receta_id
      INNER JOIN materiales m ON m.id = rm.material_id
      WHERE o.id = $1
    `, [id]);

    return resultado;
  }

  async buscar(estado?: string, producto?: string, fecha?: string) {

    return this.ordenRepository.query(`
      SELECT o.id::text AS id,
             o.codigo,
             r.producto_codigo,
             r.producto_nombre,
             o.cantidad_solicitada::text AS cantidad_solicitada,
             o.fecha_programada::text AS fecha_programada,
             o.estado,
             o.responsable_usuario_id::text AS responsable_usuario_id
      FROM ordenes_produccion o
      JOIN recetas r ON r.id = o.receta_id
      WHERE ($1::text IS NULL OR o.estado = $1)
        AND ($2::text IS NULL OR r.producto_nombre ILIKE '%' || $2 || '%'
             OR r.producto_codigo ILIKE '%' || $2 || '%')
        AND ($3::date IS NULL OR o.fecha_programada = $3::date)
      ORDER BY o.fecha_programada DESC, o.id DESC
    `, [estado?.trim() || null, producto?.trim() || null, fecha?.trim() || null]);
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
    if (!Number.isSafeInteger(dto.usuarioResponsableId) || dto.usuarioResponsableId < 1) {
      throw new BadRequestException('Usuario responsable inválido');
    }

    const esInicio = dto.nuevoEstado === EstadoOrden.EN_PRODUCCION;
    const esFinalizacion = dto.nuevoEstado === EstadoOrden.FINALIZADA;
    const esCancelacion = dto.nuevoEstado === EstadoOrden.CANCELADA;
    const requiereEncargadoProduccion =
      esInicio || esFinalizacion || esCancelacion;
    const accion = esInicio
      ? 'iniciar'
      : esFinalizacion
        ? 'finalizar'
        : 'cancelar';

    if (requiereEncargadoProduccion && !usuarioAutenticado) {
      throw new ServiceUnavailableException(
        `No se puede ${accion} la orden: Production Service aún no recibe la identidad validada de ABC-151.`,
      );
    }

    if (
      requiereEncargadoProduccion &&
      usuarioAutenticado.rolNombre !== 'Encargado de Producción'
    ) {
      throw new ForbiddenException(
        `Solo el rol Encargado de Producción puede ${accion} órdenes.`,
      );
    }

    if (requiereEncargadoProduccion) {
      const responsableId = Number(usuarioAutenticado.sub);
      if (!Number.isSafeInteger(responsableId) || responsableId < 1) {
        throw new UnauthorizedException(
          esInicio
            ? 'La identidad autenticada no contiene un ID de usuario válido.'
            : 'La identidad autenticada no contiene un ID de usuario válido para cerrar la orden.',
        );
      }
      dto = { ...dto, usuarioResponsableId: responsableId };
    }


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

    if (esCancelacion) {
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
            usuarioResponsableId: dto.usuarioResponsableId,
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


    return this.historialRepository.find({
      where: { ordenId },
      order: {
        fechaHora: 'DESC',
        id: 'DESC',
      },
    });


  }


}
