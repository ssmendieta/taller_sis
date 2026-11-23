import {
  Body,
  Controller,
  Get,
  BadRequestException,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Query,
  Req,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { PERMISO_CONSULTAR_RUTAS } from '../rutas/rutas.controller';
import { DashboardService } from './dashboard.service';
import { FiltroDashboardDto } from './dto/filtro-dashboard.dto';
import { GuardarMetaKpiDto } from './dto/guardar-meta-kpi.dto';
import { AvisoKpiResponse, AvisosSinLeerResponse, DetalleKpiResponse, KpisSemaforoResponse, MetaKpiResponse } from './dashboard.interface';
import { MetricasDashboardLogisticaResponse } from './dashboard.interface';

// ABC-328: Métricas e indicadores del dashboard de logística (ABC-107).
// Monitorea boletas por estado, rutas planificadas, entregas e incidencias de transporte.
export const PERMISO_GESTIONAR_METAS_KPI = 'kpis.metas.gestionar';

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

  // ABC-495: metas de KPI y semáforo.
  @Get('kpis/metas')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  listarMetas(): Promise<MetaKpiResponse[]> {
    return this.dashboardService.listarMetas();
  }

  @Get('kpis/metas/:kpi')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  obtenerMeta(@Param('kpi') kpi: string): Promise<MetaKpiResponse> {
    return this.dashboardService.obtenerMeta(kpi);
  }

  @Put('kpis/metas/:kpi')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_GESTIONAR_METAS_KPI)
  guardarMeta(
    @Param('kpi') kpi: string,
    @Body() dto: GuardarMetaKpiDto,
    @Req() req: { usuarioId?: number | string },
  ): Promise<MetaKpiResponse> {
    return this.dashboardService.guardarMeta(kpi, dto, req.usuarioId);
  }

  // ABC-500: avisos de KPI en rojo.
  @Get('kpis/avisos')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  listarAvisos(@Query('leido') leido?: string): Promise<AvisoKpiResponse[]> {
    if (leido !== undefined && leido !== 'true' && leido !== 'false') {
      throw new BadRequestException('El filtro "leido" debe ser true o false.');
    }
    return this.dashboardService.listarAvisos(leido === undefined ? undefined : leido === 'true');
  }

  // ABC-526: cantidad de avisos pendientes (sin leer).
  @Get('kpis/avisos/sin-leer')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  contarAvisosSinLeer(): Promise<AvisosSinLeerResponse> {
    return this.dashboardService.contarAvisosSinLeer();
  }

  @Patch('kpis/avisos/:id/leido')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  marcarAvisoLeido(@Param('id', ParseIntPipe) id: number): Promise<AvisoKpiResponse> {
    return this.dashboardService.marcarAvisoLeido(id);
  }

  // ABC-512: registros detrás de un KPI, con el mismo criterio de su cálculo.
  @Get('kpis/:kpi/detalle')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  obtenerDetalleKpi(
    @Param('kpi') kpi: string,
    @Query() query: FiltroDashboardDto,
  ): Promise<DetalleKpiResponse> {
    return this.dashboardService.obtenerDetalleKpi(kpi, query);
  }

  @Get('kpis')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  obtenerKpis(): Promise<KpisSemaforoResponse> {
    return this.dashboardService.obtenerKpisConSemaforo();
  }

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  obtenerGeneral(
    @Query() query: FiltroDashboardDto,
  ): Promise<MetricasDashboardLogisticaResponse> {
    return this.dashboardService.obtenerMetricas(query);
  }
}
