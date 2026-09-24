import { Test, TestingModule } from '@nestjs/testing';
import { OrdenesProduccionService } from './ordenes_produccion.service';

describe('OrdenesProduccionService', () => {
  let service: OrdenesProduccionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdenesProduccionService],
    }).compile();

    service = module.get<OrdenesProduccionService>(OrdenesProduccionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
