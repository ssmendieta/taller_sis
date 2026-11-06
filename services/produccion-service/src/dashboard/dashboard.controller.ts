import {
  Controller,
  Get,
  Query,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PermisoProduccionGuard, PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';
import { DashboardService } from './dashboard.service';
import { FiltroDashboardDto } from './dto/filtro-dashboard.dto';
import { MetricasDashboardResponse } from './dashboard.interface';

// ABC-324: Métricas e indicadores del dashboard de producción (ABC-106).
// Accesible con permiso 'ordenes.consultar' para supervisores de producción.
@Controller('dashboard')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metricas')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerMetricas(
    @Query() query: FiltroDashboardDto,
  ): Promise<MetricasDashboardResponse> {
    return this.dashboardService.obtenerMetricas(query);
  }

  @Get('indicadores')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerIndicadores(
    @Query() query: FiltroDashboardDto,
  ): Promise<MetricasDashboardResponse> {
    return this.dashboardService.obtenerMetricas(query);
  }

  @Get()
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerGeneral(
    @Query() query: FiltroDashboardDto,
  ): Promise<MetricasDashboardResponse> {
    return this.dashboardService.obtenerMetricas(query);
  }
}
