import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditoriaService } from './auditoria.service';
import { Auditoria } from './entities/auditoria.entity';

describe('AuditoriaService', () => {
  let service: AuditoriaService;

  const mockAuditoriaRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entity: Partial<Auditoria>) =>
      Promise.resolve({
        id: '1',
        ...entity,
        fecha_hora: new Date(),
      }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditoriaService,
        {
          provide: getRepositoryToken(Auditoria),
          useValue: mockAuditoriaRepo,
        },
      ],
    }).compile();

    service = module.get<AuditoriaService>(AuditoriaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe registrar un evento de auditoria correctamente', async () => {
    const fechaHora = new Date();
    const params = {
      usuarioId: '10',
      accion: 'CREACION_USUARIO',
      entidad: 'USUARIO',
      entidadId: '20',
      usuarioAfectadoId: '20',
      datosDespues: { correo: 'test@example.com' },
    };

    const resultado = await service.registrar(params);

    expect(mockAuditoriaRepo.create).toHaveBeenCalled();
    expect(mockAuditoriaRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      usuario_actor_id: '10',
      accion: 'CREACION_USUARIO',
      entidad: 'USUARIO',
      entidad_id: '20',
      usuario_afectado_id: '20',
      datos_antes: null,
      datos_despues: { correo: 'test@example.com' },
    }));
    expect(mockAuditoriaRepo.save).toHaveBeenCalled();
    expect(resultado.usuario_actor_id).toBe('10');
    expect(resultado.accion).toBe('CREACION_USUARIO');
    expect(resultado.entidad_id).toBe('20');
    expect(resultado.usuario_afectado_id).toBe('20');
    expect(resultado.fecha_hora).toBeInstanceOf(Date);
    expect(resultado.fecha_hora.getTime()).toBeGreaterThan(0);
    expect(fechaHora.getTime()).toBeGreaterThan(0);
  });

  it('usa el repositorio de la transacción para guardar el evento', async () => {
    const transactionRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity: Partial<Auditoria>) => entity),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(transactionRepo),
    };

    await service.registrar({
      usuarioId: '10',
      accion: 'CAMBIO_ESTADO',
      entidad: 'USUARIO',
      entidadId: '20',
      usuarioAfectadoId: '20',
    }, manager as any);

    expect(manager.getRepository).toHaveBeenCalledWith(Auditoria);
    expect(transactionRepo.save).toHaveBeenCalled();
    expect(mockAuditoriaRepo.save).not.toHaveBeenCalled();
  });
});
