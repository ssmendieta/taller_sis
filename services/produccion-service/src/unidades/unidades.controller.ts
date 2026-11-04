import { Controller, Get, UseGuards } from '@nestjs/common';
import { SesionGuard } from '../auth/sesion.guard';
import { UNIDADES_MEDIDA } from './unidades.catalogo';

// Catálogo de solo lectura. Solo exige sesión (cualquier rol autenticado):
// el Encargado lo necesita para recetas/materiales, el Supervisor para ver
// unidades en órdenes y el Administrador para auditoría de formatos.
@UseGuards(SesionGuard)
@Controller('unidades-medida')
export class UnidadesController {
  @Get()
  listar() {
    return UNIDADES_MEDIDA;
  }
}
