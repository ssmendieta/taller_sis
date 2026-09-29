import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OrdenesService } from './ordenes.service';
import { EstadoOrden } from './estado-orden.enum';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';

// ABC-190: calcula materiales reales y observa la persistencia, sin simular el resultado del cálculo.
describe('ABC-190: precondiciones de inicio de orden', () => {
  const orden = () => ({ id: 12, codigo: 'ORD-12', producto_id: 5, cantidad: 10,
    estado: EstadoOrden.PLANIFICADA, iniciada_en: null as Date | null });
  const actor = { sub: 8, rolNombre: 'Encargado de Producción' };
  const dto = { nuevoEstado: EstadoOrden.EN_PRODUCCION, usuarioResponsableId: 8 };
  let actual: ReturnType<typeof orden>;
  let historial: Array<Record<string, unknown>>;
  let recetaActiva: boolean;
  let disponible: number | null;
  let transacciones: number;
  let service: OrdenesService;

  beforeEach(() => {
    actual = orden();
    historial = [];
    recetaActiva = true;
    disponible = 25;
    transacciones = 0;
    const manager = {
      create: (_tipo: unknown, valor: Record<string, unknown>) => valor,
      save: async (tipo: unknown, valor: Record<string, unknown>) => {
        if (tipo === OrdenProduccion) Object.assign(actual, valor);
        if (tipo === HistorialEstadoOrden) historial.push(valor);
        return valor;
      },
      findOne: async () => ({ ...actual }),
    };
    const ordenRepo = {
      findOne: async () => ({ ...actual }),
      query: async () => [{ material_id: 3, codigo: 'MAT-3', nombre: 'Harina',
        unidad_medida: 'kg', cantidad_requerida: '2' }],
      manager: { transaction: async (fn: (m: typeof manager) => Promise<unknown>) => {
        transacciones += 1;
        return fn(manager);
      } },
    };
    const inventarioRepo = { findOne: async () => disponible === null ? null : {
      materialId: 3, cantidadDisponible: disponible,
    } };
    const recetas = { findOne: async () => ({ id: 5, activa: recetaActiva }) };
    service = new OrdenesService(ordenRepo as any, {} as any, inventarioRepo as any, recetas as any);
  });

  function sinCambios() {
    expect(actual.estado).toBe(EstadoOrden.PLANIFICADA);
    expect(actual.iniciada_en).toBeNull();
    expect(historial).toHaveLength(0);
    expect(transacciones).toBe(0);
  }

  it('rechaza otro rol sin tocar la orden', async () => {
    await expect(service.cambiarEstado(12, dto, { sub: 8, rolNombre: 'Supervisor' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    sinCambios();
  });

  it('rechaza una orden PENDIENTE aunque tenga materiales', async () => {
    actual.estado = EstadoOrden.PENDIENTE;
    await expect(service.cambiarEstado(12, dto, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(actual.estado).toBe(EstadoOrden.PENDIENTE);
    expect(historial).toHaveLength(0);
    expect(transacciones).toBe(0);
  });

  it('rechaza una receta inactiva sin generar historial', async () => {
    recetaActiva = false;
    await expect(service.cambiarEstado(12, dto, actor)).rejects.toBeInstanceOf(ConflictException);
    sinCambios();
  });

  it.each([[null, 'FALTANTE'], [15, 'INSUFICIENTE']] as const)(
    'requiere 20 kg y con inventario %s informa %s sin iniciar', async (cantidad, estado) => {
      disponible = cantidad;
      const error = await service.cambiarEstado(12, dto, actor).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        materiales_faltantes: [expect.objectContaining({
          material_id: 3, cantidad_requerida: 20, cantidad_disponible: cantidad ?? 0, estado,
        })],
      });
      sinCambios();
    },
  );

  it('con 25 kg inicia y registra al actor validado en una sola transacción', async () => {
    await service.cambiarEstado(12, { ...dto, usuarioResponsableId: 999 }, actor);
    expect(transacciones).toBe(1);
    expect(actual.estado).toBe(EstadoOrden.EN_PRODUCCION);
    expect(actual.iniciada_en).toBeInstanceOf(Date);
    expect(historial).toEqual([expect.objectContaining({ ordenId: 12,
      estadoAnterior: EstadoOrden.PLANIFICADA, estadoNuevo: EstadoOrden.EN_PRODUCCION,
      usuarioResponsableId: 8 })]);
  });
});
