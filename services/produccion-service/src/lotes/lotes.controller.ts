import { Body, Controller, Get, Param, Post, Req, SetMetadata, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CrearLoteDto } from './dto/crear-lote.dto';
import { LotesService } from './lotes.service';

@Controller('lotes')
@UseGuards(PermisoProduccionGuard)
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  // Asignar conformes a un lote usa el mismo permiso que registrar conformes (ABC-82).
  @Post()
  @SetMetadata(PERMISO_PRODUCCION, 'calidad.registrar_conformes')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  crear(@Body() dto: CrearLoteDto, @Req() request: { usuarioId: number }) {
    return this.lotesService.create(dto, request.usuarioId);
  }

  @Get('orden/:ordenCodigo')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  consultarPorOrden(@Param('ordenCodigo') ordenCodigo: string) {
    return this.lotesService.findByOrderCode(ordenCodigo);
  }
}
