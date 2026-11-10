import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { GrupoSalida } from '../agrupacion/entities/grupo-salida.entity';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { GuardarRutaDto } from './dto/guardar-ruta.dto';
import { EstadoRuta } from './entities/estado-ruta.enum';
import { RutaParadaBoleta } from './entities/ruta-parada-boleta.entity';
import { RutaParada } from './entities/ruta-parada.entity';
import { Ruta } from './entities/ruta.entity';
import { ValidacionAsignacionService } from './validaciones/validacion-asignacion.service';

// Una boleta solo puede viajar en una ruta que todavía no terminó.
const ESTADOS_RUTA_ACTIVOS = [EstadoRuta.PLANIFICADA, EstadoRuta.DESPACHADA];
const MAX_BIGINT = BigInt('9223372036854775807');

function idValido(id: string): boolean {
  return /^\d+$/.test(id) && BigInt(id) >= BigInt('1') && BigInt(id) <= MAX_BIGINT;
}

@Injectable()
export class RutasService {
  constructor(
    @InjectRepository(Ruta)
    private readonly rutas: Repository<Ruta>,
    private readonly dataSource: DataSource,
    private readonly validacion: ValidacionAsignacionService,
  ) {}

  // ABC-371: recursos y unidades se consultan antes de la transacción; dentro se
  // bloquean vehículo y chofer del día y se validan solapamientos y capacidad.
  async create(dto: GuardarRutaDto, usuarioId: string, authorization = ''): Promise<Ruta> {
    const externos = await this.validacion.consultarDatosExternos(this.dataSource.manager, dto, authorization);
    return this.dataSource.transaction(async (manager) => {
      await this.bloquearGrupoActivo(manager, dto.grupoId);
      await this.validacion.bloquearRecursos(manager, dto);
      await this.validarBoletas(manager, dto, null);
      await this.validacion.validar(manager, dto, null, externos);
      const ruta = await manager.save(Ruta, {
        grupoId: dto.grupoId,
        fechaProgramada: dto.fechaProgramada,
        vehiculoExternoId: dto.vehiculoExternoId,
        choferExternoId: dto.choferExternoId,
        estado: EstadoRuta.PLANIFICADA,
        responsableUsuarioId: usuarioId,
      });
      await this.guardarParadas(manager, ruta.id, dto);
      return this.cargar(manager, ruta.id);
    });
  }

  async update(id: string, dto: GuardarRutaDto, authorization = ''): Promise<Ruta> {
    if (!idValido(id)) throw new NotFoundException('Ruta no encontrada');
    const externos = await this.validacion.consultarDatosExternos(this.dataSource.manager, dto, authorization);
    return this.dataSource.transaction(async (manager) => {
      await this.bloquearGrupoActivo(manager, dto.grupoId);
      const [actual] = await manager.query(
        'SELECT id, estado FROM rutas WHERE id = $1 FOR UPDATE',
        [id],
      ) as Array<{ id: string; estado: EstadoRuta }>;
      if (!actual) throw new NotFoundException('Ruta no encontrada');
      if (actual.estado !== EstadoRuta.PLANIFICADA) {
        throw new ConflictException(
          `Solo se puede editar una ruta PLANIFICADA (estado actual: ${actual.estado})`,
        );
      }
      await this.validacion.bloquearRecursos(manager, dto);
      await this.validarBoletas(manager, dto, id);
      await this.validacion.validar(manager, dto, id, externos);
      await manager.update(Ruta, { id }, {
        grupoId: dto.grupoId,
        fechaProgramada: dto.fechaProgramada,
        vehiculoExternoId: dto.vehiculoExternoId,
        choferExternoId: dto.choferExternoId,
      });
      // Las paradas se reemplazan completas; sus documentos se borran en cascada.
      await manager.delete(RutaParada, { rutaId: id });
      await this.guardarParadas(manager, id, dto);
      return this.cargar(manager, id);
    });
  }

  findAll(): Promise<Ruta[]> {
    return this.rutas.find({
      relations: { paradas: { boletas: true } },
      order: { fechaProgramada: 'DESC', id: 'DESC', paradas: { secuencia: 'ASC' } },
    });
  }

  async findOne(id: string): Promise<Ruta> {
    if (!idValido(id)) throw new NotFoundException('Ruta no encontrada');
    const ruta = await this.rutas.findOne({
      where: { id },
      relations: { paradas: { boletas: true } },
      order: { paradas: { secuencia: 'ASC' } },
    });
    if (!ruta) throw new NotFoundException('Ruta no encontrada');
    return ruta;
  }

  private async bloquearGrupoActivo(manager: EntityManager, id: string | null): Promise<void> {
    if (id === null) return;
    const grupo = await manager.findOne(GrupoSalida, {
      where: { id, deshechoEn: IsNull() }, lock: { mode: 'pessimistic_write' },
    });
    if (!grupo) throw new ConflictException('El grupo no existe o fue deshecho');
  }

  // Bloquea las boletas para que dos rutas guardadas a la vez no puedan tomar la misma.
  private async validarBoletas(manager: EntityManager, dto: GuardarRutaDto, rutaId: string | null): Promise<void> {
    const boletaIds = dto.paradas.flatMap((parada) => parada.boletaIds);
    const boletas = await manager.query(
      'SELECT id::text AS id, estado FROM boletas_envio WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
      [boletaIds],
    ) as Array<{ id: string; estado: EstadoBoleta }>;

    const encontradas = new Map(boletas.map((boleta) => [boleta.id, boleta.estado]));
    const faltantes = boletaIds.filter((boletaId) => !encontradas.has(boletaId));
    if (faltantes.length > 0) {
      throw new NotFoundException(`Boletas no encontradas: ${faltantes.join(', ')}`);
    }
    const noEmitidas = boletas.filter((boleta) => boleta.estado !== EstadoBoleta.EMITIDA);
    if (noEmitidas.length > 0) {
      throw new ConflictException(
        `Solo se pueden asignar boletas EMITIDAS: ${noEmitidas.map((b) => `${b.id} (${b.estado})`).join(', ')}`,
      );
    }

    const ocupadas = await manager.query(
      `SELECT documento.boleta_id::text AS boleta_id, ruta.id::text AS ruta_id
         FROM rutas_paradas_boletas documento
         INNER JOIN rutas_paradas parada ON parada.id = documento.parada_id
         INNER JOIN rutas ruta ON ruta.id = parada.ruta_id
        WHERE documento.boleta_id = ANY($1::bigint[])
          AND ruta.estado = ANY($2::varchar[])
          AND ($3::bigint IS NULL OR ruta.id <> $3::bigint)`,
      [boletaIds, ESTADOS_RUTA_ACTIVOS, rutaId],
    ) as Array<{ boleta_id: string; ruta_id: string }>;
    if (ocupadas.length > 0) {
      throw new ConflictException(
        `Boletas ya asignadas a otra ruta activa: ${ocupadas.map((o) => `${o.boleta_id} (ruta ${o.ruta_id})`).join(', ')}`,
      );
    }
  }

  private async guardarParadas(manager: EntityManager, rutaId: string, dto: GuardarRutaDto): Promise<void> {
    for (const [indice, datos] of dto.paradas.entries()) {
      const parada = await manager.save(RutaParada, {
        rutaId,
        secuencia: indice + 1,
        destino: datos.destino,
      });
      await manager.save(RutaParadaBoleta, datos.boletaIds.map((boletaId) => manager.create(RutaParadaBoleta, {
        paradaId: parada.id,
        boletaId,
      })));
    }
  }

  private async cargar(manager: EntityManager, id: string): Promise<Ruta> {
    const ruta = await manager.findOne(Ruta, {
      where: { id },
      relations: { paradas: { boletas: true } },
      order: { paradas: { secuencia: 'ASC' } },
    });
    if (!ruta) throw new NotFoundException('Ruta no encontrada');
    return ruta;
  }
}
