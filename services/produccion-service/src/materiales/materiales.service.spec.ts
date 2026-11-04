import { BadRequestException, ConflictException } from '@nestjs/common';

import { MaterialesService } from './materiales.service';

describe('MaterialesService', () => {
  let service: MaterialesService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 1, ...dto })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new MaterialesService(repository as never);
  });

  describe('update (PUT /materiales/:id)', () => {
    it('rechaza un PUT sin campos con 400 y no llega a TypeORM', async () => {
      await expect(service.update(1, {})).rejects.toThrow(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('envía solo los campos presentes al repositorio', async () => {
      repository.findOne.mockResolvedValue({ id: 1, nombre: 'Acero laminado' });

      const resultado = await service.update(1, { nombre: 'Acero inoxidable' });

      expect(repository.update).toHaveBeenCalledWith(1, {
        nombre: 'Acero inoxidable',
      });
      expect(resultado).toEqual({ id: 1, nombre: 'Acero laminado' });
    });

    it('descarta los campos undefined del DTO', async () => {
      repository.findOne.mockResolvedValue({ id: 1, codigo: 'MAT-02' });

      await service.update(1, { codigo: 'MAT-02', nombre: undefined });

      expect(repository.update).toHaveBeenCalledWith(1, { codigo: 'MAT-02' });
    });

    it('responde 404 cuando el material no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update(1, { nombre: 'Acero' })).rejects.toMatchObject({
        status: 404,
      });
    });

    it('responde 409 cuando el código ya pertenece a otro material', async () => {
      repository.findOne.mockResolvedValue({ id: 9, codigo: 'MAT-02' });

      await expect(
        service.update(1, { codigo: 'MAT-02' }),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('create (POST /materiales)', () => {
    it('responde 409 ante un código repetido sin llegar a la restricción única', async () => {
      repository.findOne.mockResolvedValue({ id: 7, codigo: 'MAT-01' });

      await expect(
        service.create({ codigo: 'MAT-01', nombre: 'Acero', unidadMedida: 'kg' }),
      ).rejects.toThrow(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('crea el material cuando el código no existe', async () => {
      const resultado = await service.create({
        codigo: 'MAT-02',
        nombre: 'Acero inoxidable',
        unidadMedida: 'kg',
      });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { codigo: 'MAT-02' },
      });
      expect(resultado).toEqual({
        id: 1,
        codigo: 'MAT-02',
        nombre: 'Acero inoxidable',
        unidadMedida: 'kg',
      });
    });
  });
});
