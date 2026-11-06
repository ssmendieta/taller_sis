import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { GuardarRutaDto } from './dto/guardar-ruta.dto';
import { ValidarGuardarRutaPipe } from './dto/validar-guardar-ruta.pipe';
import { RutasService } from './rutas.service';

export const PERMISO_GESTIONAR_RUTAS = 'logistica.rutas.gestionar';
export const PERMISO_CONSULTAR_RUTAS = 'logistica.rutas.consultar';

@Controller('rutas')
@UseGuards(PermisoLogisticaGuard)
export class RutasController {
  constructor(private readonly service: RutasService) {}

  @Post()
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_GESTIONAR_RUTAS)
  create(
    @Body(new ValidarGuardarRutaPipe()) dto: GuardarRutaDto,
    @Req() request: { usuarioId: string; headers?: { authorization?: string } },
  ) {
    return this.service.create(dto, request.usuarioId, request.headers?.authorization ?? '');
  }

  @Put(':id')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_GESTIONAR_RUTAS)
  update(
    @Param('id') id: string,
    @Body(new ValidarGuardarRutaPipe()) dto: GuardarRutaDto,
    @Req() request: { headers?: { authorization?: string } },
  ) {
    // La sesión se reenvía a Producción para conocer la unidad de la carga (ABC-371).
    return this.service.update(id, dto, request.headers?.authorization ?? '');
  }

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
