import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { CrearSolicitudSalidaDto } from './dto/crear-solicitud-salida.dto';
import { ValidarSolicitudSalidaPipe } from './dto/validar-solicitud-salida.pipe';
import { SolicitudesSalidaService } from './solicitudes-salida.service';

@Controller('solicitudes-salida')
@UseGuards(PermisoLogisticaGuard)
export class SolicitudesSalidaController {
  constructor(private readonly service: SolicitudesSalidaService) {}

  @Post()
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.solicitudes.gestionar')
  create(
    @Body(new ValidarSolicitudSalidaPipe()) dto: CrearSolicitudSalidaDto,
    @Req() request: { usuarioId: string },
  ) {
    return this.service.create(dto, request.usuarioId);
  }

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.solicitudes.consultar')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.solicitudes.consultar')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
