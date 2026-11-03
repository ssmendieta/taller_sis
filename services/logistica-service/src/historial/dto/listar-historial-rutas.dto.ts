import { EstadoRuta } from '../../rutas/entities/estado-ruta.enum';

export interface ListarHistorialRutasDto {
  page: number;
  limit: number;
  fechaDesde?: string;
  fechaHasta?: string;
  estado?: EstadoRuta;
  chofer?: string;
}

export interface HistorialRutaItemDto {
  id: string;
  fechaProgramada: string;
  estado: EstadoRuta;
  vehiculoExternoId: string;
  choferExternoId: string;
  totalParadas: number;
  totalBoletas: number;
}

export interface PaginatedHistorialRutasDto {
  items: HistorialRutaItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
