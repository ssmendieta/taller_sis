import { Controller, Get, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { PERMISO_CONSULTAR_RUTAS } from '../rutas/rutas.controller';
import { ListarHistorialRutasDto } from './dto/listar-historial-rutas.dto';
import { ValidarListarHistorialRutasPipe } from './dto/validar-listar-historial-rutas.pipe';
import { HistorialService } from './historial.service';

@Controller('historial')
@UseGuards(PermisoLogisticaGuard)
export class HistorialController {
  constructor(private readonly service: HistorialService) {}

  @Get('rutas')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  listarRutas(@Query(new ValidarListarHistorialRutasPipe()) query: ListarHistorialRutasDto) {
    return this.service.listarRutas(query);
  }
}
