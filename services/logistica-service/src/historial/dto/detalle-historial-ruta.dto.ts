import { EstadoEntrega } from '../../despacho/estado-entrega.enum';
import { EstadoBoleta } from '../../boletas/entities/estado-boleta.enum';
import { EstadoRuta } from '../../rutas/entities/estado-ruta.enum';

export interface DetalleBoletaRutaDto {
  id: string;
  numero: string | null;
  estado: EstadoBoleta;
  ordenId: string;
  items: Array<{ referencia: string; cantidad: string }>;
}

export interface DetalleParadaRutaDto {
  id: string;
  secuencia: number;
  destino: string;
  estadoEntrega: EstadoEntrega;
  entregaActualizadaEn: string | null;
  entregaObservacion: string | null;
  boletas: DetalleBoletaRutaDto[];
}

// Un lote puede viajar en varias boletas de la misma ruta; se suma solo lo no anulado.
export interface LoteRutaDto {
  referencia: string;
  cantidadVigente: string;
  boletas: string[];
}

export interface DetalleHistorialRutaDto {
  ruta: {
    id: string;
    fechaProgramada: string;
    fechaOriginal: string;
    estado: EstadoRuta;
    vehiculoExternoId: string;
    choferExternoId: string;
    despachadaEn: string | null;
    completadaEn: string | null;
  };
  paradas: DetalleParadaRutaDto[];
  lotes: LoteRutaDto[];
  incidencias: Array<{
    id: string;
    paradaId: string | null;
    tipo: string;
    motivo: string;
    registradaPorUsuarioId: string;
    registradaEn: string;
  }>;
  reprogramaciones: Array<{
    id: string;
    incidenciaId: string | null;
    fechaAnterior: string;
    fechaNueva: string;
    motivo: string;
    registradaPorUsuarioId: string;
    registradaEn: string;
  }>;
}
