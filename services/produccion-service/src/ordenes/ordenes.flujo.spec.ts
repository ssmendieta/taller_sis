import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OrdenesService } from './ordenes.service';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';
import { EstadoOrden } from './estado-orden.enum';

describe('ABC-170: flujo completo de estados de una orden', () => {
  let orden: {
    id: number;
    estado: EstadoOrden;
    iniciada_en: Date | null;
    finalizada_en: Date | null;
    cancelada_en: Date | null;
  };
  let registros: Record<string, unknown>[];
  let service: OrdenesService;

  beforeEach(() => {
    orden = {
      id: 42,
      estado: EstadoOrden.PENDIENTE,
      iniciada_en: null,
      finalizada_en: null,
      cancelada_en: null,
    };
    registros = [];

    const manager = {
      create: (_entity: unknown, datos: Record<string, unknown>) => datos,
      save: async (entity: unknown, datos: Record<string, unknown>) => {
        if (entity === OrdenProduccion) {
          orden = { ...orden, ...datos } as typeof orden;
        } else if (entity === HistorialEstadoOrden) {
          registros.push({ ...datos });
        }
        return datos;
      },
      findOne: async (_entity: unknown, opciones: { where: { id: number } }) =>
        opciones.where.id === orden.id ? { ...orden } : null,
    };
    const ordenRepository = {
      findOne: async (opciones: { where: { id: number } }) =>
        opciones.where.id === orden.id ? { ...orden } : null,
      manager: { transaction: async (operacion: (m: typeof manager) => Promise<unknown>) => operacion(manager) },
    } as unknown as Repository<OrdenProduccion>;
    const historialRepository = {
      find: async () => [...registros].reverse(),
    } as unknown as Repository<HistorialEstadoOrden>;

    service = new OrdenesService(ordenRepository, historialRepository, {} as any,
      { findOne: async () => ({ activa: true }) } as any);
    jest.spyOn(service, 'compararDisponibilidadMateriales').mockResolvedValue({
      orden_id: 42, orden_codigo: 'ORD-42', cantidad_producir: 1, materiales: [],
    });
  });

  async function pasarA(estado: EstadoOrden, motivo?: string) {
    return service.cambiarEstado(42, {
      nuevoEstado: estado,
      usuarioResponsableId: 7,
      motivo,
    }, { sub: 7, rolNombre: 'Encargado de Producción' });
  }

  it('recorre PENDIENTE → PLANIFICADA → EN_PRODUCCION → FINALIZADA con historial', async () => {
    await pasarA(EstadoOrden.PLANIFICADA);
    expect(orden.estado).toBe(EstadoOrden.PLANIFICADA);
    expect(orden.iniciada_en).toBeNull();

    await pasarA(EstadoOrden.EN_PRODUCCION);
    expect(orden.estado).toBe(EstadoOrden.EN_PRODUCCION);
    expect(orden.iniciada_en).toBeInstanceOf(Date);

    await pasarA(EstadoOrden.FINALIZADA);
    expect(orden.estado).toBe(EstadoOrden.FINALIZADA);
    expect(orden.finalizada_en).toBeInstanceOf(Date);

    expect(registros).toEqual([
      expect.objectContaining({ estadoAnterior: 'PENDIENTE', estadoNuevo: 'PLANIFICADA', usuarioResponsableId: 7 }),
      expect.objectContaining({ estadoAnterior: 'PLANIFICADA', estadoNuevo: 'EN_PRODUCCION', usuarioResponsableId: 7 }),
      expect.objectContaining({ estadoAnterior: 'EN_PRODUCCION', estadoNuevo: 'FINALIZADA', usuarioResponsableId: 7 }),
    ]);

    const historial = await service.obtenerHistorial(42);
    expect(historial).toHaveLength(3);
    expect(historial[0].estadoNuevo).toBe(EstadoOrden.FINALIZADA);
  });

  it('no salta estados ni crea historial cuando rechaza una transición', async () => {
    await expect(pasarA(EstadoOrden.EN_PRODUCCION)).rejects.toBeInstanceOf(BadRequestException);
    expect(orden.estado).toBe(EstadoOrden.PENDIENTE);
    expect(registros).toHaveLength(0);

    await pasarA(EstadoOrden.PLANIFICADA);
    await expect(pasarA(EstadoOrden.FINALIZADA)).rejects.toBeInstanceOf(BadRequestException);
    expect(orden.estado).toBe(EstadoOrden.PLANIFICADA);
    expect(registros).toHaveLength(1);
  });

  it.each([EstadoOrden.PENDIENTE, EstadoOrden.PLANIFICADA, EstadoOrden.EN_PRODUCCION])(
    'cancela desde %s y bloquea otros cambios',
    async (estadoInicial) => {
      if (estadoInicial !== EstadoOrden.PENDIENTE) await pasarA(EstadoOrden.PLANIFICADA);
      if (estadoInicial === EstadoOrden.EN_PRODUCCION) await pasarA(EstadoOrden.EN_PRODUCCION);
      const anteriores = registros.length;

      await pasarA(EstadoOrden.CANCELADA, 'No hay materiales');
      expect(orden.estado).toBe(EstadoOrden.CANCELADA);
      expect(orden.cancelada_en).toBeInstanceOf(Date);
      expect(registros).toHaveLength(anteriores + 1);
      expect(registros.at(-1)).toEqual(expect.objectContaining({
        estadoAnterior: estadoInicial,
        estadoNuevo: EstadoOrden.CANCELADA,
        motivo: 'No hay materiales',
      }));

      await expect(pasarA(EstadoOrden.PLANIFICADA)).rejects.toBeInstanceOf(BadRequestException);
      expect(registros).toHaveLength(anteriores + 1);
    },
  );

  it('una orden FINALIZADA no puede volver a producción ni cancelarse', async () => {
    await pasarA(EstadoOrden.PLANIFICADA);
    await pasarA(EstadoOrden.EN_PRODUCCION);
    await pasarA(EstadoOrden.FINALIZADA);

    await expect(pasarA(EstadoOrden.EN_PRODUCCION)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pasarA(EstadoOrden.CANCELADA)).rejects.toBeInstanceOf(BadRequestException);
    expect(orden.estado).toBe(EstadoOrden.FINALIZADA);
    expect(registros).toHaveLength(3);
  });
});
