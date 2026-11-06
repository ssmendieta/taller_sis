import {
  Controller,
  Get,
  Query,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { PERMISO_CONSULTAR_RUTAS } from '../rutas/rutas.controller';
import { DashboardService } from './dashboard.service';
import { FiltroDashboardDto } from './dto/filtro-dashboard.dto';
import { MetricasDashboardLogisticaResponse } from './dashboard.interface';

// ABC-328: Métricas e indicadores del dashboard de logística (ABC-107).
// Monitorea boletas por estado, rutas planificadas, entregas e incidencias de transporte.
@Controller('dashboard')
@UseGuards(PermisoLogisticaGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metricas')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  obtenerMetricas(
    @Query() query: FiltroDashboardDto,
  ): Promise<MetricasDashboardLogisticaResponse> {
    return this.dashboardService.obtenerMetricas(query);
  }

  @Get('indicadores')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  obtenerIndicadores(
    @Query() query: FiltroDashboardDto,
  ): Promise<MetricasDashboardLogisticaResponse> {
    return this.dashboardService.obtenerMetricas(query);
  }

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  obtenerGeneral(
    @Query() query: FiltroDashboardDto,
  ): Promise<MetricasDashboardLogisticaResponse> {
    return this.dashboardService.obtenerMetricas(query);
  }
}
