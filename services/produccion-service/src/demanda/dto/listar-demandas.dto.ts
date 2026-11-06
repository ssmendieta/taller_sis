import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  ESTADOS_DEMANDA,
  EstadoDemanda,
  ORIGENES_DEMANDA,
  OrigenDemanda,
} from '../entities/demanda.entity';

export class ListarDemandasDto {
  @IsOptional()
  @IsIn(ORIGENES_DEMANDA, { message: `El origen debe ser uno de: ${ORIGENES_DEMANDA.join(', ')}` })
  origen?: OrigenDemanda;

  @IsOptional()
  @IsIn(ESTADOS_DEMANDA, { message: `El estado debe ser uno de: ${ESTADOS_DEMANDA.join(', ')}` })
  estado?: EstadoDemanda;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página mínima es 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite mínimo es 1' })
  @Max(100, { message: 'El límite máximo es 100' })
  limit: number = 10;
}

export interface DemandaItemResumenDto {
  id: string;
  productoCodigo: string;
  cantidad: string;
  unidad: string;
}

export interface DemandaResumenDto {
  id: string;
  origen: OrigenDemanda;
  demandaExternaId: string;
  fechaRequerida: string;
  estado: EstadoDemanda;
  recibidaEn: string;
  confirmadaEn: string | null;
  items: DemandaItemResumenDto[];
  totalItems: number;
}

export interface PaginatedDemandasDto {
  items: DemandaResumenDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
