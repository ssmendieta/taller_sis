import { Test, TestingModule } from '@nestjs/testing';
import { PermisosController } from './permisos.controller';
import { PermisosService } from './permisos.service';
import { PermisosGuard } from '../authz/permisos.guard';

describe('PermisosController', () => {
  let controller: PermisosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermisosController],
      providers: [PermisosService],
    })
      .overrideGuard(PermisosGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PermisosController>(PermisosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
