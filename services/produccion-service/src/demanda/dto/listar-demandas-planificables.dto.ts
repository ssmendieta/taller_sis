import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ORIGENES_DEMANDA, OrigenDemanda } from '../entities/demanda.entity';

/**
 * Filtros admitidos por el listado de demandas planificables.
 * El estado no forma parte del contrato: el servidor siempre consulta CONFIRMADA.
 */
export class ListarDemandasPlanificablesDto {
  @IsOptional()
  @IsIn(ORIGENES_DEMANDA, { message: `El origen debe ser uno de: ${ORIGENES_DEMANDA.join(', ')}` })
  origen?: OrigenDemanda;

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
