import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ErpRecursosClient } from './clientes/erp-recursos.client';
import { AvisoRespaldoRecursos, ConsultaRecursosQuery, ConsultaRecursosRespuesta, OrigenRecursos } from './dto/consulta-recursos.dto';
import { ErpRecursosNoDisponibleError, MotivoFalloErpRecursos } from './dto/recursos-logisticos-v1';
import { compararCapacidad } from './dto/recursos-logisticos-v1.validator';
import { CopiaRecursosLogisticos, RESPALDO_RECURSOS_LOGISTICOS, RespaldoRecursosLogisticos } from './respaldo-recursos';

const CAUSAS: Record<MotivoFalloErpRecursos, string> = {
  TIMEOUT: 'El ERP no respondió a tiempo',
  NO_DISPONIBLE: 'El ERP no está disponible',
  CREDENCIALES: 'Las credenciales del ERP no son válidas',
  SOLICITUD_RECHAZADA: 'El ERP rechazó la consulta',
  RESPUESTA_INVALIDA: 'El ERP devolvió datos que no cumplen el contrato',
};

function armarRespuesta(
  query: ConsultaRecursosQuery,
  origen: OrigenRecursos,
  { respuesta, sincronizadoEn }: CopiaRecursosLogisticos,
  aviso: AvisoRespaldoRecursos | null,
): ConsultaRecursosRespuesta {
  const { disponible, capacidadMinima } = query;
  return {
    fecha: query.fecha,
    origen,
    generadoEn: respuesta.generadoEn,
    sincronizadoEn,
    aviso,
    filtros: { disponible, capacidadMinima },
    totales: { vehiculos: respuesta.vehiculos.length, choferes: respuesta.choferes.length },
    // Capacidad: misma unidad y suficiente; no se convierte entre unidades.
    vehiculos: respuesta.vehiculos.filter((vehiculo) =>
      (disponible === null || vehiculo.disponible === disponible) &&
      (!capacidadMinima || compararCapacidad(vehiculo.capacidad, capacidadMinima) === 'SUFICIENTE')),
    choferes: respuesta.choferes.filter((chofer) => disponible === null || chofer.disponible === disponible),
  };
}

// ABC-353: consulta de recursos para planificar rutas. Es solo lectura: no
// reserva recursos en el ERP ni en Logística (la asignación es ABC-368).
@Injectable()
export class RecursosLogisticosService {
  private readonly logger = new Logger(RecursosLogisticosService.name);

  constructor(
    private readonly erp: ErpRecursosClient,
    @Inject(RESPALDO_RECURSOS_LOGISTICOS) private readonly respaldo: RespaldoRecursosLogisticos,
  ) {}

  async consultar(query: ConsultaRecursosQuery): Promise<ConsultaRecursosRespuesta> {
    let copia: CopiaRecursosLogisticos;
    try {
      copia = { respuesta: await this.erp.consultarRecursos(query.fecha), sincronizadoEn: new Date().toISOString() };
    } catch (error) {
      if (!(error instanceof ErpRecursosNoDisponibleError)) throw error;
      return this.desdeRespaldo(query, error);
    }
    // Solo una respuesta válida del ERP reemplaza la copia; si no se guarda,
    // los datos siguen siendo actuales y se devuelven igual.
    try {
      await this.respaldo.reemplazar(copia);
    } catch (error) {
      this.registrar('RESPALDO_RECURSOS_NO_GUARDADO', query.fecha, error);
    }
    return armarRespuesta(query, 'ERP', copia, null);
  }

  private async desdeRespaldo(query: ConsultaRecursosQuery, fallo: ErpRecursosNoDisponibleError) {
    let copia: CopiaRecursosLogisticos | null = null;
    try {
      copia = await this.respaldo.obtener(query.fecha);
    } catch (error) {
      this.registrar('RESPALDO_RECURSOS_NO_LEIDO', query.fecha, error);
    }
    const causa = CAUSAS[fallo.motivo];
    if (!copia) {
      // Sin copia no se devuelven listas: vacías parecerían "sin recursos".
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        codigo: 'RECURSOS_NO_DISPONIBLES',
        motivo: fallo.motivo,
        message: `${causa} y no hay copia de respaldo para ${query.fecha}. No se puede confirmar la disponibilidad de vehículos ni choferes.`,
      });
    }
    return armarRespuesta(query, 'RESPALDO', copia, {
      motivo: fallo.motivo,
      mensaje: `${causa}. Se muestra la última copia de respaldo; puede no reflejar cambios posteriores a su sincronización.`,
    });
  }

  private registrar(codigo: string, fecha: string, error: unknown) {
    this.logger.error(JSON.stringify({ codigo, fecha, detalle: (error as Error)?.message ?? String(error) }));
  }
}
