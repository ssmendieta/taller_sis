import { Body, Controller, Get, Param, Post, Put, Query, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { CrearBoletaDto } from './dto/crear-boleta.dto';
import { ValidarBoletaPipe } from './dto/validar-boleta.pipe';
import { ActualizarBoletaItemsDto } from './dto/actualizar-boleta-items.dto';
import { ValidarActualizarBoletaItemsPipe } from './dto/validar-actualizar-boleta-items.pipe';
import { ListarBoletasDto } from './dto/listar-boletas.dto';
import { ValidarListarBoletasPipe } from './dto/validar-listar-boletas.pipe';
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

  @Put(':id/items')
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.boletas.gestionar')
  updateItems(
    @Param('id') id: string,
    @Body(new ValidarActualizarBoletaItemsPipe()) dto: ActualizarBoletaItemsDto,
    @Req() request: { usuarioId: string; headers: { authorization?: string } },
  ) {
    return this.service.updateItems(id, dto, request.usuarioId, request.headers.authorization ?? '');
  }

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.boletas.consultar')
  findAll(
    @Query(new ValidarListarBoletasPipe()) query: ListarBoletasDto,
    @Req() request: { headers: { authorization?: string } },
  ) {
    return this.service.findAll(query, request.headers?.authorization ?? '');
  }

  @Get(':id')
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.boletas.consultar')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
}
