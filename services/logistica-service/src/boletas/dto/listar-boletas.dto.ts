import { EstadoBoleta } from '../entities/estado-boleta.enum';
import { BoletaEnvio } from '../entities/boleta-envio.entity';

export interface ListarBoletasDto {
  page?: number;
  limit?: number;
  ordenId?: string;
  orden?: string;
  estado?: EstadoBoleta;
  fechaDesde?: string;
  fechaHasta?: string;
  desde?: string;
  hasta?: string;
}

export interface PaginatedBoletasResultDto {
  items: BoletaEnvio[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
