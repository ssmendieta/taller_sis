import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { Ruta } from '../rutas/entities/ruta.entity';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { idDeGrupoValido, SolicitudParaGrupo } from './dto/validar-agrupar.pipe';
import { GrupoSalida } from './entities/grupo-salida.entity';
import { GrupoSolicitud } from './entities/grupo-solicitud.entity';
import { evaluarCompatibilidad } from './reglas/compatibilidad';

@Injectable()
export class AgrupacionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly produccion: LotesProduccionClient,
  ) {}

  async listar() {
    // Una sola consulta mantiene miembros y estado de despacho en la misma instantánea.
    return this.dataSource.query(`
      SELECT g.id::text, g.destino, g.fecha_requerida::text AS "fechaRequerida",
             g.tipo_carga AS "tipoCarga", g.unidad_carga AS "unidadCarga",
             g.creado_en AS "creadoEn", g.creado_por_usuario_id::text AS "creadoPorUsuarioId",
             ARRAY_AGG(m.solicitud_id::text ORDER BY m.solicitud_id) AS "solicitudIds",
             EXISTS(SELECT 1 FROM rutas r WHERE r.grupo_id = g.id AND r.despachada_en IS NOT NULL)
               AS despachado
        FROM grupos_salida g
        JOIN grupos_salida_solicitudes m ON m.grupo_id = g.id AND m.liberada_en IS NULL
        WHERE g.deshecho_en IS NULL
        GROUP BY g.id
        ORDER BY g.id DESC
    `);
  }

  async agrupar(entradas: SolicitudParaGrupo[], usuarioId: string, authorization: string) {
    const ids = entradas.map(({ solicitudId }) => solicitudId);
    const previas = await this.dataSource.getRepository(SolicitudSalida).findBy({ id: In(ids) });
    if (previas.length !== ids.length) throw new NotFoundException('Hay solicitudes que no existen');
    const ordenPorSolicitud = new Map(previas.map((solicitud) => [solicitud.id, solicitud.ordenId]));
    const unidades = new Map<string, string>();
    for (const ordenId of new Set(ordenPorSolicitud.values())) {
      const orden = await this.produccion.consultarOrdenPorId(ordenId, authorization);
      const unidad = (orden.producto as { unidad_producto?: unknown } | null)?.unidad_producto;
      if (typeof unidad !== 'string' || !unidad.trim() || unidad.trim().length > 50) {
        throw new ConflictException(`La orden ${ordenId} no tiene una unidad de carga válida`);
      }
      unidades.set(ordenId, unidad.trim());
    }

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const filas = await manager.find(SolicitudSalida, {
        where: { id: In(ids) }, order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' },
      });
      if (filas.length !== ids.length || filas.some((fila) => fila.ordenId !== ordenPorSolicitud.get(fila.id))) {
        throw new ConflictException('Las solicitudes cambiaron durante la consulta. Actualiza el listado');
      }
      const ocupadas = await manager.findBy(GrupoSolicitud, { solicitudId: In(ids), liberadaEn: IsNull() });
      if (ocupadas.length) {
        throw new ConflictException(`Solicitudes ya agrupadas: ${ocupadas.map(({ solicitudId }) => solicitudId).join(', ')}`);
      }
      const porId = new Map(filas.map((fila) => [fila.id, fila]));
      const solicitudes = entradas.map(({ solicitudId, fechaRequerida, tipoCarga }) => {
        const fila = porId.get(solicitudId)!;
        return {
          id: fila.id, estado: fila.estado, destino: fila.destinoDocumental,
          fechaRequerida, tipoCarga, unidadCarga: unidades.get(fila.ordenId)!,
        };
      });
      const compatibilidad = evaluarCompatibilidad(solicitudes);
      if (!compatibilidad.compatible) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Las solicitudes no son compatibles para agrupar',
          conflictos: compatibilidad.incompatibilidades,
        });
      }
      const [{ destino, fechaRequerida, tipoCarga, unidadCarga }] = solicitudes;
      const grupo = await manager.save(GrupoSalida, {
        destino, fechaRequerida, tipoCarga, unidadCarga, creadoPorUsuarioId: usuarioId,
      });
      await manager.insert(GrupoSolicitud, filas.map((fila) => ({ grupoId: grupo.id, solicitudId: fila.id })));
      return { ...grupo, solicitudIds: filas.map((fila) => fila.id), despachado: false };
    });
  }

  async deshacer(id: string, usuarioId: string) {
    if (!idDeGrupoValido(id)) throw new NotFoundException('Grupo no encontrado');
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const grupo = await manager.findOne(GrupoSalida, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!grupo) throw new NotFoundException('Grupo no encontrado');
      if (grupo.deshechoEn) return { id, deshechoEn: grupo.deshechoEn };
      const rutas = await manager.find(Ruta, {
        where: { grupoId: id }, order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' },
      });
      if (rutas.some((ruta) => ruta.despachadaEn !== null)) {
        throw new ConflictException('El grupo ya fue despachado');
      }
      if (rutas.length > 0) {
        await manager.update(Ruta, { id: In(rutas.map((ruta) => ruta.id)) }, { grupoId: null });
      }
      const deshechoEn = new Date();
      await manager.update(GrupoSalida, { id }, { deshechoEn, deshechoPorUsuarioId: usuarioId });
      await manager.update(GrupoSolicitud, { grupoId: id }, { liberadaEn: deshechoEn });
      return { id, deshechoEn };
    });
  }
}
