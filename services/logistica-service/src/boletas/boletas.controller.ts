import { Body, Controller, Get, Param, Post, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { CrearBoletaDto } from './dto/crear-boleta.dto';
import { ValidarBoletaPipe } from './dto/validar-boleta.pipe';
import { BoletasService } from './boletas.service';

@Controller('boletas')
@UseGuards(PermisoLogisticaGuard)
export class BoletasController {
  constructor(private readonly service: BoletasService) {}

  @Post()
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.boletas.gestionar')
  create(@Body(new ValidarBoletaPipe()) dto: CrearBoletaDto, @Req() request: { usuarioId: string; headers: { authorization?: string } }) {
    return this.service.create(dto, request.usuarioId, request.headers.authorization ?? '');
  }

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.boletas.consultar')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.boletas.consultar')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
}
