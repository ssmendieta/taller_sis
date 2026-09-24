import { Test, TestingModule } from '@nestjs/testing';
import { AvancesProduccionController } from './avances_produccion.controller';
import { AvancesProduccionService } from './avances_produccion.service';

describe('AvancesProduccionController', () => {
  let controller: AvancesProduccionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvancesProduccionController],
      providers: [AvancesProduccionService],
    }).compile();

    controller = module.get<AvancesProduccionController>(AvancesProduccionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
