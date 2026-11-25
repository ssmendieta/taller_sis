import {
  Controller,
  Get,
  Param,
  Query,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { DemandaService } from './demanda.service';
import { CumplimientoDemandaDto } from './dto/cumplimiento-demanda.dto';
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

  // ABC-449 (ABC-413): órdenes asociadas a la demanda, cantidad pedida vs producida y porcentaje cumplido.
  @Get(':id/cumplimiento')
  @SetMetadata(PERMISO_PRODUCCION, PERMISO_CONSULTAR_DEMANDAS)
  async obtenerCumplimiento(
    @Param('id') id: string,
  ): Promise<CumplimientoDemandaDto> {
    return this.demandaService.obtenerCumplimiento(id);
  }

  @Get()
  @SetMetadata(PERMISO_PRODUCCION, PERMISO_CONSULTAR_DEMANDAS)
  async listar(@Query() query: ListarDemandasDto): Promise<PaginatedDemandasDto> {
    return this.demandaService.listar(query);
  }
}
