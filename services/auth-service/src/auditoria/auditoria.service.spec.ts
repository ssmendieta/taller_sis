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
    expect(mockAuditoriaRepo.save).toHaveBeenCalled();
    expect(resultado.usuario_actor_id).toBe('10');
    expect(resultado.accion).toBe('CREACION_USUARIO');
  });
});