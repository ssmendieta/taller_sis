import { Body, Controller, Get, Param, Post, Req, SetMetadata, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CreateSolicitudMaterialDto } from './dto/create-solicitud-material.dto';
import { SolicitudesMaterialService } from './solicitudes-material.service';

@Controller('solicitudes-material')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SolicitudesMaterialController {
  constructor(private readonly solicitudesService: SolicitudesMaterialService) {}

  @Post()
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.solicitar')
  create(@Body() dto: CreateSolicitudMaterialDto, @Req() request: { usuarioId: number }) {
    return this.solicitudesService.create(dto, request.usuarioId);
  }

  @Get()
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.consultar_disponibilidad')
  findAll() {
    return this.solicitudesService.findAll();
  }

  @Get(':id')
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.consultar_disponibilidad')
  findOne(@Param('id') id: string) {
    return this.solicitudesService.findOne(id);
  }
}
