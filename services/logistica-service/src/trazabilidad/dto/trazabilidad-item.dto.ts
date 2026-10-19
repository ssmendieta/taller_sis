export interface TrazabilidadItemDetalleDto {
  id: string;
  referencia: string;
  lote: string;
  cantidad: string;
}

export interface TrazabilidadHistorialDto {
  id: string;
  evento: string;
  estadoAnterior: string;
  estadoNuevo: string;
  estado: string;
  usuarioActorId: string;
  motivo: string;
  fecha: string;
  fechaHora: string;
}

export interface TrazabilidadItemDto {
  id: string;
  boletaId: string;
  numero: string;
  fecha: string;
  naturaleza: string;
  ordenId: string;
  orden: string;
  solicitudId: string;
  destino: string;
  cantidad: string;
  unidad: string;
  lote: string;
  loteCodigo: string;
  loteId: string;
  estado: string;
  items: TrazabilidadItemDetalleDto[];
  historial: TrazabilidadHistorialDto[];
}
