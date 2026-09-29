import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrdenesService } from './ordenes.service';
import { EstadoOrden } from './estado-orden.enum';
import { RecetasService } from '../recetas/recetas.service';
import { UsuarioAutenticadoProduccion } from './ordenes.service';

describe('OrdenesService.cambiarEstado (ABC-148)', () => {
  let service: OrdenesService;

  const findOne = jest.fn();
  const managerSave = jest.fn();
  const managerCreate = jest.fn();
  const managerFindOne = jest.fn();
  const transaction = jest.fn();
  const historialFind = jest.fn();
  const recetaFindOne = jest.fn();

  const repositorioMock = {
    findOne,
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
      usuarioResponsableId: 7,
    });

    const ordenGuardada = managerSave.mock.calls[0][1];
    expect(ordenGuardada.finalizada_en).toBeInstanceOf(Date);
  });

  it('exige un motivo al cancelar y registra el motivo junto con la fecha', async () => {
    findOne.mockResolvedValue(ordenBase('PENDIENTE'));
    managerFindOne.mockResolvedValue({});

    await expect(service.cambiarEstado(1, {
      nuevoEstado: EstadoOrden.CANCELADA,
      usuarioResponsableId: 7,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();

    await service.cambiarEstado(1, {
      nuevoEstado: EstadoOrden.CANCELADA,
      usuarioResponsableId: 7,
      motivo: '  Falta materia prima  ',
    });

    const ordenGuardada = managerSave.mock.calls[0][1];
    expect(ordenGuardada.cancelada_en).toBeInstanceOf(Date);
    expect(managerCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ motivo: 'Falta materia prima' }),
    );
  });

  it('rechaza con 400 una transición inválida sin tocar la BD', async () => {
    findOne.mockResolvedValue(ordenBase('PLANIFICADA'));

    await expect(
      service.cambiarEstado(1, {
        nuevoEstado: EstadoOrden.FINALIZADA,
        usuarioResponsableId: 7,
      }),
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
      usuarioResponsableId: 7,
    });

    // El 1er save es la orden, el 2do es la única fila de historial.
    expect(managerSave).toHaveBeenCalledTimes(2);
    expect(managerCreate).toHaveBeenCalledTimes(1);
    expect(managerCreate).toHaveBeenCalledWith(
      expect.anything(),
      {
        ordenId: 1,
        estadoAnterior: EstadoOrden.EN_PRODUCCION,
        estadoNuevo: EstadoOrden.FINALIZADA,
        usuarioResponsableId: 7,
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
