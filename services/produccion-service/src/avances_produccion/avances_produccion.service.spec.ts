import { Test, TestingModule } from '@nestjs/testing';
import { AvancesProduccionService } from './avances_produccion.service';

describe('AvancesProduccionService', () => {
  let service: AvancesProduccionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AvancesProduccionService],
    }).compile();

    service = module.get<AvancesProduccionService>(AvancesProduccionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
