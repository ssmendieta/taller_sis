import { Body, Controller, Get, Param, Post, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISO_LOGISTICA, PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { PERMISO_CONSULTAR_RUTAS, PERMISO_GESTIONAR_RUTAS } from '../rutas/rutas.controller';
import { RegistrarIncidenciaDto, ValidarIncidenciaPipe } from './dto/validar-incidencia.pipe';
import { IncidenciasService } from './incidencias.service';

@Controller('rutas/:id/incidencias')
@UseGuards(PermisoLogisticaGuard)
export class IncidenciasController {
  constructor(private readonly incidencias: IncidenciasService) {}

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  consultar(@Param('id') id: string) {
    return this.incidencias.consultar(id);
  }

  @Post()
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_GESTIONAR_RUTAS)
  registrar(
    @Param('id') id: string,
    @Body(new ValidarIncidenciaPipe()) dto: RegistrarIncidenciaDto,
    @Req() request: { usuarioId: string; headers: { authorization?: string } },
  ) {
    return this.incidencias.registrar(id, dto, request.usuarioId, request.headers.authorization ?? '');
  }
}
