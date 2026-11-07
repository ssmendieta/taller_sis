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
import { ListarDemandasPlanificablesDto } from './dto/listar-demandas-planificables.dto';

export const PERMISO_CONSULTAR_DEMANDAS = 'ordenes.consultar';

@Controller('demandas')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DemandaController {
  constructor(private readonly demandaService: DemandaService) {}

  // ABC-366: contrato separado que nunca expone demandas meramente recibidas.
  @Get('planificables')
  @SetMetadata(PERMISO_PRODUCCION, PERMISO_CONSULTAR_DEMANDAS)
  async listarPlanificables(
    @Query() query: ListarDemandasPlanificablesDto,
  ): Promise<PaginatedDemandasDto> {
    return this.demandaService.listarPlanificables(query);
  }

  @Get()
  @SetMetadata(PERMISO_PRODUCCION, PERMISO_CONSULTAR_DEMANDAS)
  async listar(@Query() query: ListarDemandasDto): Promise<PaginatedDemandasDto> {
    return this.demandaService.listar(query);
  }
}
