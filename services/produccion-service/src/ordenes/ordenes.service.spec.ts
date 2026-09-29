import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrdenesService } from './ordenes.service';
import { EstadoOrden } from './estado-orden.enum';
import { RecetasService } from '../recetas/recetas.service';
import { UsuarioAutenticadoProduccion } from './ordenes.service';

describe('OrdenesService.cambiarEstado (ABC-148)', () => {
  let service: OrdenesService;

  const findOne = jest.fn();
  const find = jest.fn();
  const createQueryBuilder = jest.fn();
  const managerSave = jest.fn();
  const managerCreate = jest.fn();
  const managerFindOne = jest.fn();
  const transaction = jest.fn();
  const historialFind = jest.fn();
  const recetaFindOne = jest.fn();

  const repositorioMock = {
    find,
    findOne,
    createQueryBuilder,
    query: jest.fn(),
    manager: {
      transaction,
    },
  };

  const historialRepositorioMock = {
    find: historialFind,
  };

  const inventarioRepositorioMock = {
    findOne: jest.fn(),
  };

  const recetasServiceMock = { findOne: recetaFindOne };

  beforeEach(() => {
    jest.clearAllMocks();

    managerCreate.mockImplementation((_clase: unknown, objeto: unknown) => objeto);
    managerSave.mockImplementation(async (...args: unknown[]) => args[1] ?? args[0]);
    transaction.mockImplementation(async (cb: (m: unknown) => unknown) =>
      cb({
        save: managerSave,
        create: managerCreate,
        findOne: managerFindOne,
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new OrdenesService(
      repositorioMock as any,
      historialRepositorioMock as any,
      inventarioRepositorioMock as any,
      recetasServiceMock as unknown as RecetasService,
    );
  });

  function ordenBase(estado: string) {
    return {
      id: 1,
      codigo: 'OP-001',
      producto_id: 1,
      cantidad: 10,
      fecha_programada: '2026-10-01',
      estado,
      responsable_id: 7,
      iniciada_en: null,
      finalizada_en: null,
      cancelada_en: null,
    };
  }

  const usuarioProduccion: UsuarioAutenticadoProduccion = {
    sub: 27,
    rolNombre: 'Encargado de Producción',
  };

  function prepararInicio(estado = EstadoOrden.PLANIFICADA) {
    findOne.mockResolvedValue(ordenBase(estado));
    recetaFindOne.mockResolvedValue({ id: 1, activa: true });
    jest.spyOn(service, 'compararDisponibilidadMateriales').mockResolvedValue({
      orden_id: 1,
      orden_codigo: 'OP-001',
      cantidad_producir: 10,
      materiales: [],
    });
    managerFindOne.mockResolvedValue({ ...ordenBase(EstadoOrden.EN_PRODUCCION) });
  }

  it('aplica una transición válida y registra el historial en la misma transacción', async () => {
    findOne.mockResolvedValue(ordenBase('PENDIENTE'));
    managerFindOne.mockResolvedValue({ ...ordenBase('PLANIFICADA') });

    const resultado = await service.cambiarEstado(1, {
      nuevoEstado: EstadoOrden.PLANIFICADA,
      motivo: 'Planificada para el lunes',
      usuarioResponsableId: 7,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    // 1er save: la orden con el nuevo estado; 2do save: la fila de historial.
    expect(managerSave).toHaveBeenCalledTimes(2);
    expect(managerCreate).toHaveBeenCalledWith(
      expect.anything(),
      {
        ordenId: 1,
        estadoAnterior: EstadoOrden.PENDIENTE,
        estadoNuevo: EstadoOrden.PLANIFICADA,
        usuarioResponsableId: 7,
        motivo: 'Planificada para el lunes',
      },
    );
    expect(resultado).toEqual({ ...ordenBase('PLANIFICADA') });
  });

  it('marca iniciada_en al pasar a EN_PRODUCCION', async () => {
    findOne.mockResolvedValue(ordenBase('PLANIFICADA'));
    recetaFindOne.mockResolvedValue({ id: 1, activa: true });
    jest.spyOn(service, 'compararDisponibilidadMateriales').mockResolvedValue({
      orden_id: 1,
      orden_codigo: 'OP-001',
      cantidad_producir: 10,
      materiales: [],
    });
    managerFindOne.mockResolvedValue({});

    await service.cambiarEstado(1, {
      nuevoEstado: EstadoOrden.EN_PRODUCCION,
      usuarioResponsableId: 7,
    }, usuarioProduccion);

    const ordenGuardada = managerSave.mock.calls[0][1];
    expect(ordenGuardada.estado).toBe(EstadoOrden.EN_PRODUCCION);
    expect(ordenGuardada.iniciada_en).toBeInstanceOf(Date);
  });

  describe('ABC-188: precondiciones de inicio', () => {
    it('bloquea el inicio si no se recibió identidad autenticada', async () => {
      await expect(service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.EN_PRODUCCION,
        usuarioResponsableId: 7,
      })).rejects.toThrow(/identidad validada de ABC-151/);

      expect(findOne).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rechaza un rol distinto al rol exacto requerido', async () => {
      await expect(service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.EN_PRODUCCION,
        usuarioResponsableId: 7,
      }, { sub: 27, rolNombre: 'Administrador' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(findOne).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rechaza una orden que no está PLANIFICADA sin persistir transición', async () => {
      prepararInicio(EstadoOrden.PENDIENTE);

      await expect(service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.EN_PRODUCCION,
        usuarioResponsableId: 7,
      }, usuarioProduccion)).rejects.toBeInstanceOf(BadRequestException);

      expect(recetaFindOne).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rechaza una receta inactiva sin persistir transición', async () => {
      prepararInicio();
      recetaFindOne.mockResolvedValue({ id: 1, activa: false });

      await expect(service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.EN_PRODUCCION,
        usuarioResponsableId: 7,
      }, usuarioProduccion)).rejects.toBeInstanceOf(ConflictException);

      expect(recetaFindOne).toHaveBeenCalledWith(1);
      expect(transaction).not.toHaveBeenCalled();
    });

    it.each(['FALTANTE', 'INSUFICIENTE'])(
      'rechaza materiales %s y devuelve su detalle exacto', async (estado) => {
        prepararInicio();
        const material = {
          material_id: 12,
          codigo: 'MAT-12',
          nombre: 'Acero',
          unidad_medida: 'kg',
          cantidad_requerida: 20,
          cantidad_disponible: estado === 'FALTANTE' ? 0 : 8,
          estado,
        };
        jest.spyOn(service, 'compararDisponibilidadMateriales').mockResolvedValue({
          orden_id: 1,
          orden_codigo: 'OP-001',
          cantidad_producir: 10,
          materiales: [material],
        });

        const error = await service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.EN_PRODUCCION,
          usuarioResponsableId: 7,
        }, usuarioProduccion).catch((resultado) => resultado);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          message: 'No se puede iniciar la orden porque faltan materiales.',
          orden_id: 1,
          materiales_faltantes: [material],
        });
        expect(transaction).not.toHaveBeenCalled();
      },
    );

    it('permite iniciar y reutiliza la transición existente con la identidad autenticada', async () => {
      prepararInicio();

      await service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.EN_PRODUCCION,
        usuarioResponsableId: 999,
      }, usuarioProduccion);

      expect(recetaFindOne).toHaveBeenCalledWith(1);
      expect(service.compararDisponibilidadMateriales).toHaveBeenCalledWith(1);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(managerSave).toHaveBeenCalledTimes(2);
      expect(managerSave.mock.calls[0][1].estado).toBe(EstadoOrden.EN_PRODUCCION);
      expect(managerCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        usuarioResponsableId: 27,
        estadoAnterior: EstadoOrden.PLANIFICADA,
        estadoNuevo: EstadoOrden.EN_PRODUCCION,
      }));
    });
  });

  it('marca finalizada_en al pasar a FINALIZADA', async () => {
    findOne.mockResolvedValue(ordenBase('EN_PRODUCCION'));
    managerFindOne.mockResolvedValue({});

    await service.cambiarEstado(1, {
      nuevoEstado: EstadoOrden.FINALIZADA,
      usuarioResponsableId: 999,
    }, usuarioProduccion);

    const ordenGuardada = managerSave.mock.calls[0][1];
    expect(ordenGuardada.finalizada_en).toBeInstanceOf(Date);
    expect(managerCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ usuarioResponsableId: 27 }),
    );
  });

  it('cancela desde PENDIENTE con motivo y registra fecha y responsable autenticado', async () => {
    findOne.mockResolvedValue(ordenBase('PENDIENTE'));
    managerFindOne.mockResolvedValue({});

    await service.cambiarEstado(1, {
      nuevoEstado: EstadoOrden.CANCELADA,
      motivo: '  Falta de insumos  ',
      usuarioResponsableId: 999,
    }, usuarioProduccion);

    const ordenGuardada = managerSave.mock.calls[0][1];
    expect(ordenGuardada.cancelada_en).toBeInstanceOf(Date);
    expect(managerCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuarioResponsableId: 27,
        motivo: 'Falta de insumos',
      }),
    );
  });

  it.each([EstadoOrden.PENDIENTE, EstadoOrden.PLANIFICADA])(
    'rechaza finalizar desde %s usando la matriz existente', async (estado) => {
      findOne.mockResolvedValue(ordenBase(estado));

      await expect(
        service.cambiarEstado(
          1,
          { nuevoEstado: EstadoOrden.FINALIZADA, usuarioResponsableId: 999 },
          usuarioProduccion,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([EstadoOrden.PENDIENTE, EstadoOrden.PLANIFICADA, EstadoOrden.EN_PRODUCCION])(
    'permite cancelar desde %s con motivo', async (estado) => {
      findOne.mockResolvedValue(ordenBase(estado));
      managerFindOne.mockResolvedValue({});

      await service.cambiarEstado(
        1,
        {
          nuevoEstado: EstadoOrden.CANCELADA,
          motivo: 'Cancelación solicitada',
          usuarioResponsableId: 999,
        },
        usuarioProduccion,
      );

      expect(managerSave.mock.calls[0][1].cancelada_en).toBeInstanceOf(Date);
      expect(managerCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          estadoAnterior: estado,
          estadoNuevo: EstadoOrden.CANCELADA,
          usuarioResponsableId: 27,
          motivo: 'Cancelación solicitada',
        }),
      );
    },
  );

  it.each([undefined, '', '   '])(
    'rechaza cancelar con motivo ausente o vacío (%s)', async (motivo) => {
      findOne.mockResolvedValue(ordenBase('PENDIENTE'));

      await expect(
        service.cambiarEstado(
          1,
          {
            nuevoEstado: EstadoOrden.CANCELADA,
            motivo,
            usuarioResponsableId: 999,
          },
          usuarioProduccion,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([EstadoOrden.FINALIZADA, EstadoOrden.CANCELADA])(
    'no permite transiciones posteriores desde %s', async (estado) => {
      findOne.mockResolvedValue(ordenBase(estado));

      await expect(
        service.cambiarEstado(1, {
          nuevoEstado: EstadoOrden.PLANIFICADA,
          usuarioResponsableId: 7,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('requiere la identidad ABC-151 y el rol correcto para cerrar una orden', async () => {
    await expect(
      service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.FINALIZADA,
        usuarioResponsableId: 7,
      }),
    ).rejects.toThrow(/identidad validada de ABC-151/);

    await expect(
      service.cambiarEstado(
        1,
        {
          nuevoEstado: EstadoOrden.CANCELADA,
          motivo: 'Motivo válido',
          usuarioResponsableId: 7,
        },
        { sub: 27, rolNombre: 'Supervisor' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza finalizar una orden con rol Supervisor', async () => {
    await expect(
      service.cambiarEstado(
        1,
        {
          nuevoEstado: EstadoOrden.FINALIZADA,
          usuarioResponsableId: 7,
        },
        { sub: 27, rolNombre: 'Supervisor' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('responde 503 al cancelar una orden sin identidad autenticada', async () => {
    await expect(
      service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.CANCELADA,
        motivo: 'Motivo válido',
        usuarioResponsableId: 7,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 400 una transición inválida sin tocar la BD', async () => {
    findOne.mockResolvedValue(ordenBase('PLANIFICADA'));

    await expect(
      service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.FINALIZADA,
        usuarioResponsableId: 7,
      }, usuarioProduccion),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 400 un estado fuera del enum', async () => {
    findOne.mockResolvedValue(ordenBase('PENDIENTE'));

    await expect(
      service.cambiarEstado(1, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nuevoEstado: 'APROBADA' as any,
        usuarioResponsableId: 7,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 404 una orden inexistente', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.cambiarEstado(999, {
        nuevoEstado: EstadoOrden.PLANIFICADA,
        usuarioResponsableId: 7,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('tras cambiar el estado aparece exactamente una fila nueva en el historial con anterior y nuevo correctos (ABC-149)', async () => {
    findOne.mockResolvedValue(ordenBase('EN_PRODUCCION'));
    managerFindOne.mockResolvedValue({});

    await service.cambiarEstado(1, {
      nuevoEstado: EstadoOrden.FINALIZADA,
      motivo: 'Lote completo',
      usuarioResponsableId: 999,
    }, usuarioProduccion);

    // El 1er save es la orden, el 2do es la única fila de historial.
    expect(managerSave).toHaveBeenCalledTimes(2);
    expect(managerCreate).toHaveBeenCalledTimes(1);
    expect(managerCreate).toHaveBeenCalledWith(
      expect.anything(),
      {
        ordenId: 1,
        estadoAnterior: EstadoOrden.EN_PRODUCCION,
        estadoNuevo: EstadoOrden.FINALIZADA,
        usuarioResponsableId: 27,
        motivo: 'Lote completo',
      },
    );
  });

  it('obtenerHistorial devuelve las filas ordenadas por fechaHora DESC', async () => {
    findOne.mockResolvedValue(ordenBase('PLANIFICADA'));
    const filas = [
      { id: 2, ordenId: 1, estadoAnterior: 'PENDIENTE', estadoNuevo: 'PLANIFICADA' },
      { id: 1, ordenId: 1, estadoAnterior: null, estadoNuevo: 'PENDIENTE' },
    ];
    historialFind.mockResolvedValue(filas);

    const resultado = await service.obtenerHistorial(1);

    expect(historialFind).toHaveBeenCalledWith({
      where: { ordenId: 1 },
      order: { fechaHora: 'DESC', id: 'DESC' },
    });
    expect(resultado).toEqual(filas);
  });

  it('obtenerHistorial rechaza con 404 una orden inexistente', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.obtenerHistorial(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(historialFind).not.toHaveBeenCalled();
  });

  it('ABC-144: devuelve las órdenes del repositorio sin filtros', async () => {
    const ordenes = [ordenBase('PENDIENTE'), ordenBase('PLANIFICADA')];
    find.mockResolvedValue(ordenes);

    await expect(service.findAll()).resolves.toBe(ordenes);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith();
  });

  it('ABC-144: consulta el código exacto y devuelve la orden encontrada', async () => {
    const orden = { ...ordenBase('PLANIFICADA'), codigo: 'OP-001' };
    findOne.mockResolvedValue(orden);

    await expect(service.findByCodigo('OP-001')).resolves.toBe(orden);
    expect(findOne).toHaveBeenCalledWith({ where: { codigo: 'OP-001' } });
  });

  it('ABC-144: responde 404 cuando el código exacto no existe', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.findByCodigo('OP-NO-EXISTE')).rejects.toThrow(
      new NotFoundException('Orden con código OP-NO-EXISTE no encontrada'),
    );
    expect(findOne).toHaveBeenCalledWith({ where: { codigo: 'OP-NO-EXISTE' } });
  });

  it('conserva la búsqueda existente por estado, producto y fecha', async () => {
    const filas: unknown[] = [];
    (repositorioMock.query as jest.Mock).mockResolvedValue(filas);

    await expect(service.buscar('PLANIFICADA', 'OP-00', '2026-10-01')).resolves.toBe(filas);

    expect(repositorioMock.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM ordenes_produccion'),
      ['PLANIFICADA', 'OP-00', '2026-10-01'],
    );
  });


  it('ABC-172: devuelve DISPONIBLE cuando hay suficiente material', async () => {
    findOne.mockResolvedValue(ordenBase('PENDIENTE'));

    repositorioMock.query = jest.fn().mockResolvedValue([
      {
        material_id: 1,
        codigo: 'MAT-001',
        nombre: 'Acero',
        unidad_medida: 'kg',
        cantidad_requerida: 2,
      },
    ]);

    inventarioRepositorioMock.findOne.mockResolvedValue({
      materialId: 1,
      cantidadDisponible: 25,
    });

    const resultado = await service.compararDisponibilidadMateriales(1);

    expect(resultado.materiales[0]).toEqual(
      expect.objectContaining({
        material_id: 1,
        cantidad_requerida: 20,
        cantidad_disponible: 25,
        estado: 'DISPONIBLE',
      }),
    );
  });

  it('ABC-172: devuelve INSUFICIENTE cuando el material disponible no alcanza', async () => {
    findOne.mockResolvedValue(ordenBase('PENDIENTE'));

    repositorioMock.query = jest.fn().mockResolvedValue([
      {
        material_id: 1,
        codigo: 'MAT-001',
        nombre: 'Acero',
        unidad_medida: 'kg',
        cantidad_requerida: 2,
      },
    ]);

    inventarioRepositorioMock.findOne.mockResolvedValue({
      materialId: 1,
      cantidadDisponible: 15,
    });

    const resultado = await service.compararDisponibilidadMateriales(1);

    expect(resultado.materiales[0]).toEqual(
      expect.objectContaining({
        cantidad_requerida: 20,
        cantidad_disponible: 15,
        estado: 'INSUFICIENTE',
      }),
    );
  });

  it('ABC-172: devuelve FALTANTE cuando no existe inventario para el material', async () => {
    findOne.mockResolvedValue(ordenBase('PENDIENTE'));

    repositorioMock.query = jest.fn().mockResolvedValue([
      {
        material_id: 1,
        codigo: 'MAT-001',
        nombre: 'Acero',
        unidad_medida: 'kg',
        cantidad_requerida: 2,
      },
    ]);

    inventarioRepositorioMock.findOne.mockResolvedValue(null);

    const resultado = await service.compararDisponibilidadMateriales(1);

    expect(resultado.materiales[0]).toEqual(
      expect.objectContaining({
        cantidad_requerida: 20,
        cantidad_disponible: 0,
        estado: 'FALTANTE',
      }),
    );
  });

  it('ABC-172: devuelve 404 cuando la orden no existe', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.compararDisponibilidadMateriales(999),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

});
