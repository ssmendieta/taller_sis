import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';
import { ObservacionesController } from './observaciones.controller';
import { ObservacionesService } from './observaciones.service';
import { TipoObservacion } from './entities/tipo-observacion.enum';

describe('ABC-322: ObservacionesService', () => {
  let repo: any;
  let ordenExiste: boolean;
  let service: ObservacionesService;

  beforeEach(() => {
    ordenExiste = true;
    repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: '1', fechaHora: new Date('2026-11-03T12:00:00Z'), ...value })),
      find: jest.fn().mockResolvedValue([]),
    };
    const dataSource = { getRepository: () => ({ existsBy: jest.fn(async () => ordenExiste) }) };
    service = new ObservacionesService(repo, dataSource as any);
  });

  it('registra con autor de sesión y descripción recortada', async () => {
    const result = await service.registrar(
      { ordenId: 2, tipo: TipoObservacion.INCIDENCIA, descripcion: '  Falla del horno  ' }, 3, ' Paula ',
    );
    expect(repo.save).toHaveBeenCalledWith({
      ordenId: '2', tipo: 'INCIDENCIA', descripcion: 'Falla del horno', autorUsuarioId: '3', autorNombre: 'Paula',
    });
    expect(result).toMatchObject({ id: '1', autorUsuarioId: '3' });
  });

  it('no acepta autor ni fecha desde el cuerpo: solo usa la sesión', async () => {
    await service.registrar(
      { ordenId: 2, tipo: TipoObservacion.OBSERVACION, descripcion: 'ok', autorUsuarioId: '99' } as any, 3,
    );
    expect(repo.save.mock.calls[0][0]).toMatchObject({ autorUsuarioId: '3', autorNombre: null });
  });

  it('rechaza descripción vacía o solo espacios', async () => {
    await expect(service.registrar({ ordenId: 2, tipo: TipoObservacion.OBSERVACION, descripcion: '   ' }, 3))
      .rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza un tipo inválido', async () => {
    await expect(service.registrar({ ordenId: 2, tipo: 'MERMA' as TipoObservacion, descripcion: 'x' }, 3))
      .rejects.toThrow(BadRequestException);
  });

  it('rechaza una orden inexistente', async () => {
    ordenExiste = false;
    await expect(service.registrar({ ordenId: 999, tipo: TipoObservacion.OBSERVACION, descripcion: 'x' }, 3))
      .rejects.toThrow(NotFoundException);
    await expect(service.listarPorOrden(999)).rejects.toThrow(NotFoundException);
  });

  it('exige sesión válida', async () => {
    await expect(service.registrar({ ordenId: 2, tipo: TipoObservacion.OBSERVACION, descripcion: 'x' }, 0))
      .rejects.toThrow(UnauthorizedException);
  });

  it('lista solo la orden pedida, de más reciente a más antigua', async () => {
    await service.listarPorOrden(2);
    expect(repo.find).toHaveBeenCalledWith({
      where: { ordenId: '2' },
      order: { fechaHora: 'DESC', id: 'DESC' },
    });
  });
});

describe('ABC-322: ObservacionesController', () => {
  it('protege las rutas con permisos de producción', () => {
    expect(Reflect.getMetadata('__guards__', ObservacionesController)).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_PRODUCCION, ObservacionesController.prototype.registrar)).toBe('ordenes.registrar_avance');
    expect(Reflect.getMetadata(PERMISO_PRODUCCION, ObservacionesController.prototype.listar)).toBe('ordenes.consultar');
  });

  it('pasa identidad y nombre de la sesión al servicio', async () => {
    const svc = { registrar: jest.fn().mockResolvedValue({ id: '1' }) };
    const controller = new ObservacionesController(svc as any);
    const dto = { ordenId: 2, tipo: TipoObservacion.OBSERVACION, descripcion: 'x' };
    await controller.registrar(dto, { usuarioId: 3, usuarioNombre: 'Paula' });
    expect(svc.registrar).toHaveBeenCalledWith(dto, 3, 'Paula');
  });
});
