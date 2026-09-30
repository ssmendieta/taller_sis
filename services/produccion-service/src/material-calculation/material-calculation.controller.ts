import {
  Body,
  Controller,
  Post,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { MaterialCalculationService } from './material-calculation.service';
import { CalcularMaterialesDto } from './dto/calcular-materiales.dto';
import {
  PermisoProduccionGuard,
  PERMISO_PRODUCCION,
} from '../auth/permiso-produccion.guard';

@Controller('material-calculation')
export class MaterialCalculationController {
  constructor(private readonly service: MaterialCalculationService) {}

  @Post('calcular')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.calcular')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  calcular(@Body() dto: CalcularMaterialesDto) {
    return this.service.calcularMateriales(
      dto.cantidadSolicitada,
      dto.materialesReceta,
    );
  }
}
