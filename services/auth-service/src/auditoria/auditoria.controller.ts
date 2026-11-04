import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authz/jwt-auth.guard';
import { PermisosGuard } from '../authz/permisos.guard';
import { RequierePermiso } from '../authz/requiere-permiso.decorator';
import { QueryAuditoriaDto } from './dto/query-auditoria.dto';
import { AuditoriaService } from './auditoria.service';

@Controller('auditoria')
@UseGuards(JwtAuthGuard, PermisosGuard)
@RequierePermiso('auditoria.consultar')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  consultar(@Query() query: QueryAuditoriaDto) {
    return this.auditoriaService.consultar(query);
  }

  // La pantalla actual filtra localmente y necesita el listado con nombres.
  @Get('listado')
  findAll() {
    return this.auditoriaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auditoriaService.findOne(id);
  }
}
