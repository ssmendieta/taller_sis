import { EstadoOrden } from '../../ordenes/estado-orden.enum';

export interface ListarHistorialOrdenesDto {
  fechaDesde?: string;
  fechaHasta?: string;
  estado?: EstadoOrden;
  producto?: string;
  page: number;
  limit: number;
}

export interface HistorialOrdenItemDto {
  id: number;
  codigo: string;
  producto_id: number;
  producto_codigo: string | null;
  producto_nombre: string | null;
  unidad_producto: string | null;
  cantidad_solicitada: string;
  fecha_programada: string;
  estado: EstadoOrden;
  responsable_usuario_id: number;
  responsable_nombre: string;
}

export interface HistorialOrdenesDto {
  items: HistorialOrdenItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
