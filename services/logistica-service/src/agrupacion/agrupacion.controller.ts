import { Body, Controller, Get, HttpCode, Param, Post, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISO_LOGISTICA, PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { AgrupacionService } from './agrupacion.service';
import { SolicitudParaGrupo, ValidarAgruparPipe } from './dto/validar-agrupar.pipe';

@Controller('agrupaciones')
@UseGuards(PermisoLogisticaGuard)
export class AgrupacionController {
  constructor(private readonly grupos: AgrupacionService) {}

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.solicitudes.consultar')
  listar() {
    return this.grupos.listar();
  }

  @Post()
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.solicitudes.gestionar')
  agrupar(
    @Body(new ValidarAgruparPipe()) solicitudes: SolicitudParaGrupo[],
    @Req() req: { usuarioId: string; headers: { authorization?: string } },
  ) {
    return this.grupos.agrupar(solicitudes, req.usuarioId, req.headers.authorization ?? '');
  }

  @Post(':id/deshacer')
  @HttpCode(200)
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.solicitudes.gestionar')
  deshacer(@Param('id') id: string, @Req() req: { usuarioId: string }) {
    return this.grupos.deshacer(id, req.usuarioId);
  }
}
