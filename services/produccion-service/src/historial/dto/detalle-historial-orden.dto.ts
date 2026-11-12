export type TipoEventoOrden =
  | 'ESTADO' | 'AVANCE' | 'CONFORME' | 'DEFECTUOSO'
  | 'PERDIDA' | 'OBSERVACION' | 'INCIDENCIA' | 'LOTE' | 'REPROCESO';

export interface EventoHistorialOrdenDto {
  clave: string;
  id: string;
  tipo: TipoEventoOrden;
  fechaHora: Date;
  usuarioId: string;
  usuarioNombre: string;
  datos: Record<string, string | null>;
}

export interface DetalleHistorialOrdenDto {
  orden: { id: number; codigo: string; estado: string; unidadProducto: string | null };
  eventos: EventoHistorialOrdenDto[];
}
