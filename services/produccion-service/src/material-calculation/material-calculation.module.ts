import { Module } from '@nestjs/common';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { ConsumosMaterialModule } from '../consumos-material/consumos-material.module';
import { MaterialCalculationController } from './material-calculation.controller';
import { MaterialCalculationService } from './material-calculation.service';

@Module({
  imports: [ConsumosMaterialModule],
  controllers: [MaterialCalculationController],
  providers: [MaterialCalculationService, PermisoProduccionGuard],
  exports: [MaterialCalculationService],
})
export class MaterialCalculationModule {}
