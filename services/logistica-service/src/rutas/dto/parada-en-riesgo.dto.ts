import { BadRequestException } from '@nestjs/common';
import { EstadoRuta } from '../entities/estado-ruta.enum';
import { MotivoRiesgo } from '../riesgo-entrega';

// ABC-458: respuesta de GET /rutas/paradas-en-riesgo.
export interface ParadaEnRiesgoDto {
  rutaId: string;
  rutaEstado: EstadoRuta;
  /** La ruta se puede reprogramar con PUT /rutas/:id (solo si está PLANIFICADA). */
  reprogramable: boolean;
  fechaProgramada: string;
  vehiculoExternoId: string;
  choferExternoId: string;
  paradaId: string;
  secuencia: number;
  destino: string;
  /** Fin del día programado en Bolivia (ISO UTC). */
  limiteEntrega: string;
  /** Negativo si ya venció. */
  minutosRestantes: number;
  motivo: MotivoRiesgo;
  motivoDetalle: string;
}

export interface ParadasEnRiesgoResponse {
  margenHoras: number;
  calculadoEn: string;
  total: number;
  paradas: ParadaEnRiesgoDto[];
}

export interface FiltroParadasRiesgo {
  desde: string | null;
  hasta: string | null;
}

function fecha(valor: unknown, campo: string): string | null {
  if (valor === undefined || valor === '') return null;
  const texto = typeof valor === 'string' ? valor.trim() : '';
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00Z`) : null;
  if (!dia || Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== texto) {
    throw new BadRequestException(`${campo} debe ser una fecha válida YYYY-MM-DD`);
  }
  return texto;
}

/** Filtro opcional por fecha programada de la ruta. */
export function validarFiltroParadasRiesgo(query: Record<string, unknown> = {}): FiltroParadasRiesgo {
  const desde = fecha(query.desde, 'desde');
  const hasta = fecha(query.hasta, 'hasta');
  if (desde && hasta && desde > hasta) throw new BadRequestException('desde no puede ser posterior a hasta');
  return { desde, hasta };
}
