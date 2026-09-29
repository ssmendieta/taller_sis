import { Test, TestingModule } from '@nestjs/testing';
import { AvancesProduccionController } from './avances_produccion.controller';
import { AvancesProduccionService } from './avances_produccion.service';
import { CreateAvancesProduccionDto } from './dto/create-avances_produccion.dto';

describe('AvancesProduccionController', () => {
  let controller: AvancesProduccionController;
  const create = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvancesProduccionController],
      providers: [
        {
          provide: AvancesProduccionService,
          useValue: { create },
        },
      ],
    }).compile();

    controller = module.get<AvancesProduccionController>(AvancesProduccionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /avances-produccion pasa solamente los datos del avance al servicio', () => {
    const dto: CreateAvancesProduccionDto = {
      orden_id: 42,
      cantidad_producida: 2.5,
    };

    controller.create(dto);

    expect(create).toHaveBeenCalledWith(dto);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
