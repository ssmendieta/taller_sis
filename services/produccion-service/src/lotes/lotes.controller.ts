import { Controller, Get, Param, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { LotesService } from './lotes.service';

@Controller('lotes')
@UseGuards(PermisoProduccionGuard)
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  @Get('orden/:ordenCodigo')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  consultarPorOrden(@Param('ordenCodigo') ordenCodigo: string) {
    return this.lotesService.findByOrderCode(ordenCodigo);
  }
}
