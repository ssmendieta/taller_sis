import { Controller, Get, Query, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISO_LOGISTICA, PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { TrazabilidadService } from './trazabilidad.service';
import { TrazabilidadQueryDto } from './dto/trazabilidad-query.dto';
import { ValidarTrazabilidadQueryPipe } from './dto/validar-trazabilidad-query.pipe';
import { TrazabilidadItemDto } from './dto/trazabilidad-item.dto';

@Controller('trazabilidad')
@UseGuards(PermisoLogisticaGuard)
export class TrazabilidadController {
  constructor(private readonly service: TrazabilidadService) {}

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.boletas.consultar')
  consultar(
    @Query(new ValidarTrazabilidadQueryPipe()) query: TrazabilidadQueryDto,
    @Req() request: { headers: { authorization?: string } },
  ): Promise<TrazabilidadItemDto[]> {
    return this.service.consultar(query, request.headers?.authorization ?? '');
  }
}
