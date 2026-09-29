import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';

import { AvancesProduccionService } from './avances_produccion.service';
import type { UsuarioAutenticadoProduccion } from '../ordenes/ordenes.service';
import { PermisoProduccionGuard, PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';

// Rutas /avances consumidas por la pantalla de avances (aporte de ramagemina,
// ABC-195/ABC-196). Se mantiene un único servicio y una única entidad sobre
// la tabla avances_produccion: no se abre otra conexión ni se duplica el
// mapeo de la tabla.
@Controller('avances')
export class AvancesPantallaController {
  constructor(private readonly avancesService: AvancesProduccionService) {}

  // Registrar avance: POST /avances/:ordenId  body: { cantidad }
  // La identidad del responsable la aporta PermisoProduccionGuard (igual que
  // POST /avances-produccion); el usuario_id del body se ignora.
  @Post(':ordenId')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.registrar_avance')
  registrar(
    @Param('ordenId', ParseIntPipe) ordenId: number,
    @Body() data: { cantidad?: unknown },
    @Req() request: { usuarioAutenticado: UsuarioAutenticadoProduccion },
  ) {
    return this.avancesService.create(
      {
        orden_id: ordenId,
        cantidad_producida: Number(data?.cantidad),
      },
      request.usuarioAutenticado,
    );
  }

  // Listar avances de una orden: GET /avances/:ordenId
  @Get(':ordenId')
  listarPorOrden(@Param('ordenId', ParseIntPipe) ordenId: number) {
    return this.avancesService.listarPorOrden(ordenId);
  }

  // Total producido de una orden: GET /avances/:ordenId/total
  @Get(':ordenId/total')
  totalProducido(@Param('ordenId', ParseIntPipe) ordenId: number) {
    return this.avancesService.totalProducido(ordenId);
  }
}
