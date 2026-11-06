import {
  Controller,
  Get,
  Query,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { DemandaService } from './demanda.service';
import { ListarDemandasDto, PaginatedDemandasDto } from './dto/listar-demandas.dto';

export const PERMISO_CONSULTAR_DEMANDAS = 'ordenes.consultar';

@Controller('demandas')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DemandaController {
  constructor(private readonly demandaService: DemandaService) {}

  @Get()
  @SetMetadata(PERMISO_PRODUCCION, PERMISO_CONSULTAR_DEMANDAS)
  async listar(@Query() query: ListarDemandasDto): Promise<PaginatedDemandasDto> {
    return this.demandaService.listar(query);
  }
}
