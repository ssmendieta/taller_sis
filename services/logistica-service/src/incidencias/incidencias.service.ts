import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EstadoEntrega } from '../despacho/estado-entrega.enum';
import { GuardarRutaDto } from '../rutas/dto/guardar-ruta.dto';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { RutaParada } from '../rutas/entities/ruta-parada.entity';
import { Ruta } from '../rutas/entities/ruta.entity';
import { ValidacionAsignacionService } from '../rutas/validaciones/validacion-asignacion.service';
import { esIdPositivo, RegistrarIncidenciaDto } from './dto/validar-incidencia.pipe';
import { IncidenciaTransporte } from './entities/incidencia-transporte.entity';
import { ReprogramacionRuta } from './entities/reprogramacion-ruta.entity';

const diaBolivia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
});

@Injectable()
export class IncidenciasService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly asignacion: ValidacionAsignacionService,
  ) {}

  async consultar(id: string) {
    this.validarId(id);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) =>
      this.historial(manager, await this.buscarRuta(manager, id)),
    );
  }

  async registrar(id: string, dto: RegistrarIncidenciaDto, autor: string, authorization: string) {
    this.validarId(id);
    const fecha = dto.nuevaFecha;
    // Consulta externa fuera de la transacción. Al entrar se verifica que los
    // datos de ruta usados para la consulta no hayan cambiado.
    const propuesta = fecha ? await this.preparar(id, fecha, authorization) : null;

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const ruta = await manager.findOne(Ruta, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!ruta) throw new NotFoundException('Ruta no encontrada');
      this.validarRutaActiva(ruta);

      if (dto.paradaId !== null) {
        const parada = await manager.findOneBy(RutaParada, { id: dto.paradaId, rutaId: id });
        if (!parada) throw new NotFoundException('Parada no encontrada en la ruta');
        if (parada.estadoEntrega !== EstadoEntrega.PENDIENTE) {
          throw new ConflictException('La entrega de la parada ya está resuelta');
        }
      }

      const fechaAnterior = ruta.fechaProgramada;
      if (fecha && propuesta) {
        this.validarFecha(ruta, fecha);
        const actual = await this.buscarRuta(manager, id, true);
        const asignacionActual = this.datosAsignacion(actual, fecha);
        if (fechaAnterior !== propuesta.fechaAnterior ||
            JSON.stringify(asignacionActual) !== JSON.stringify(propuesta.asignacion)) {
          throw new ConflictException('La ruta cambió mientras se consultaban los recursos. Vuelve a intentarlo');
        }
        await this.asignacion.bloquearRecursos(manager, asignacionActual);
        await this.asignacion.validar(manager, asignacionActual, id, propuesta.externos);
      }

      const incidencia = await manager.save(IncidenciaTransporte, {
        rutaId: id, tipo: dto.tipo, motivo: dto.motivo, paradaId: dto.paradaId,
        registradaPorUsuarioId: autor,
      });
      if (fecha) {
        await manager.save(ReprogramacionRuta, {
          rutaId: id, incidenciaId: incidencia.id, fechaAnterior, fechaNueva: fecha,
          motivo: dto.motivo, registradaPorUsuarioId: autor,
        });
        await manager.update(Ruta, { id }, { fechaProgramada: fecha });
        ruta.fechaProgramada = fecha;
      }
      return this.historial(manager, ruta);
    });
  }

  private async preparar(id: string, fecha: string, authorization: string) {
    const manager = this.dataSource.manager;
    const ruta = await this.buscarRuta(manager, id, true);
    this.validarRutaActiva(ruta);
    this.validarFecha(ruta, fecha);
    const asignacion = this.datosAsignacion(ruta, fecha);
    const externos = await this.asignacion.consultarDatosExternos(manager, asignacion, authorization);
    return { asignacion, externos, fechaAnterior: ruta.fechaProgramada };
  }

  private async buscarRuta(manager: EntityManager, id: string, incluirParadas = false): Promise<Ruta> {
    const ruta = await manager.findOne(Ruta, {
      where: { id },
      ...(incluirParadas ? {
        relations: { paradas: { boletas: true } },
        order: { paradas: { secuencia: 'ASC', boletas: { boletaId: 'ASC' } } },
      } : {}),
    });
    if (!ruta) throw new NotFoundException('Ruta no encontrada');
    return ruta;
  }

  private datosAsignacion(ruta: Ruta, fecha: string): GuardarRutaDto {
    return {
      grupoId: ruta.grupoId,
      fechaProgramada: fecha,
      vehiculoExternoId: ruta.vehiculoExternoId,
      choferExternoId: ruta.choferExternoId,
      paradas: ruta.paradas.filter((parada) => parada.estadoEntrega === EstadoEntrega.PENDIENTE).map((parada) => ({
        destino: parada.destino, boletaIds: parada.boletas.map((boleta) => boleta.boletaId),
      })),
    };
  }

  private async historial(manager: EntityManager, ruta: Ruta) {
    const incidencias = await manager.find(IncidenciaTransporte, {
      where: { rutaId: ruta.id }, order: { id: 'ASC' },
    });
    const reprogramaciones = await manager.find(ReprogramacionRuta, {
      where: { rutaId: ruta.id }, order: { id: 'ASC' },
    });
    return {
      rutaId: ruta.id,
      fechaOriginal: reprogramaciones[0]?.fechaAnterior ?? ruta.fechaProgramada,
      fechaProgramada: ruta.fechaProgramada,
      incidencias,
      reprogramaciones,
    };
  }

  private validarId(id: string) {
    if (!esIdPositivo(id)) throw new NotFoundException('Ruta no encontrada');
  }

  private validarRutaActiva(ruta: Ruta) {
    if (ruta.estado !== EstadoRuta.PLANIFICADA && ruta.estado !== EstadoRuta.DESPACHADA) {
      throw new ConflictException('La ruta debe estar planificada o despachada');
    }
  }

  private validarFecha(ruta: Ruta, fecha: string) {
    if (fecha <= diaBolivia.format(new Date()) || fecha === ruta.fechaProgramada) {
      throw new ConflictException('La nueva fecha debe ser futura y distinta de la fecha programada');
    }
  }
}
