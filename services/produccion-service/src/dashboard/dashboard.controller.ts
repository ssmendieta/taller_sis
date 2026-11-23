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
import { PermisoProduccionGuard, PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';
import { DashboardService } from './dashboard.service';
import { FiltroDashboardDto } from './dto/filtro-dashboard.dto';
import { GuardarMetaKpiDto } from './dto/guardar-meta-kpi.dto';
import { AvisoKpiResponse, AvisosSinLeerResponse, DetalleKpiResponse, KpisSemaforoResponse, MetaKpiResponse } from './dashboard.interface';
import { MetricasDashboardResponse } from './dashboard.interface';

// ABC-324: Métricas e indicadores del dashboard de producción (ABC-106).
// Accesible con permiso 'ordenes.consultar' para supervisores de producción.
export const PERMISO_GESTIONAR_METAS_KPI = 'kpis.metas.gestionar';

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

  // ABC-495: metas de KPI y semáforo.
  @Get('kpis/metas')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  listarMetas(): Promise<MetaKpiResponse[]> {
    return this.dashboardService.listarMetas();
  }

  @Get('kpis/metas/:kpi')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerMeta(@Param('kpi') kpi: string): Promise<MetaKpiResponse> {
    return this.dashboardService.obtenerMeta(kpi);
  }

  @Put('kpis/metas/:kpi')
  @SetMetadata(PERMISO_PRODUCCION, PERMISO_GESTIONAR_METAS_KPI)
  guardarMeta(
    @Param('kpi') kpi: string,
    @Body() dto: GuardarMetaKpiDto,
    @Req() req: { usuarioId?: number | string },
  ): Promise<MetaKpiResponse> {
    return this.dashboardService.guardarMeta(kpi, dto, req.usuarioId);
  }

  // ABC-500: avisos de KPI en rojo.
  @Get('kpis/avisos')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  listarAvisos(@Query('leido') leido?: string): Promise<AvisoKpiResponse[]> {
    if (leido !== undefined && leido !== 'true' && leido !== 'false') {
      throw new BadRequestException('El filtro "leido" debe ser true o false.');
    }
    return this.dashboardService.listarAvisos(leido === undefined ? undefined : leido === 'true');
  }

  // ABC-526: cantidad de avisos pendientes (sin leer).
  @Get('kpis/avisos/sin-leer')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  contarAvisosSinLeer(): Promise<AvisosSinLeerResponse> {
    return this.dashboardService.contarAvisosSinLeer();
  }

  @Patch('kpis/avisos/:id/leido')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  marcarAvisoLeido(@Param('id', ParseIntPipe) id: number): Promise<AvisoKpiResponse> {
    return this.dashboardService.marcarAvisoLeido(id);
  }

  // ABC-512: registros detrás de un KPI, con el mismo criterio de su cálculo.
  @Get('kpis/:kpi/detalle')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerDetalleKpi(
    @Param('kpi') kpi: string,
    @Query() query: FiltroDashboardDto,
  ): Promise<DetalleKpiResponse> {
    return this.dashboardService.obtenerDetalleKpi(kpi, query);
  }

  @Get('kpis')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerKpis(): Promise<KpisSemaforoResponse> {
    return this.dashboardService.obtenerKpisConSemaforo();
  }

  @Get()
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerGeneral(
    @Query() query: FiltroDashboardDto,
  ): Promise<MetricasDashboardResponse> {
    return this.dashboardService.obtenerMetricas(query);
  }
}
