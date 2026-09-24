import { Test, TestingModule } from '@nestjs/testing';
import { OrdenesProduccionController } from './ordenes_produccion.controller';
import { OrdenesProduccionService } from './ordenes_produccion.service';

describe('OrdenesProduccionController', () => {
  let controller: OrdenesProduccionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdenesProduccionController],
      providers: [OrdenesProduccionService],
    }).compile();

    controller = module.get<OrdenesProduccionController>(OrdenesProduccionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
