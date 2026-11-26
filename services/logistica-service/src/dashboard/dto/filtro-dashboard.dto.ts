import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class FiltroDashboardDto {
  @IsOptional()
  @IsDateString({}, { message: 'La fecha "desde" debe tener formato de fecha válido (YYYY-MM-DD o ISO8601).' })
  desde?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha "hasta" debe tener formato de fecha válido (YYYY-MM-DD o ISO8601).' })
  hasta?: string;

  // ABC-531: detalle de un chofer o vehículo desde el ranking (solo en el detalle de KPI).
  @IsOptional()
  @IsString({ message: 'El chofer debe ser texto.' })
  @MaxLength(80, { message: 'El chofer admite hasta 80 caracteres.' })
  chofer?: string;

  @IsOptional()
  @IsString({ message: 'El vehículo debe ser texto.' })
  @MaxLength(80, { message: 'El vehículo admite hasta 80 caracteres.' })
  vehiculo?: string;
}

// ABC-520: ranking por chofer o vehículo.
export class FiltroRankingDto {
  @IsOptional()
  @IsDateString({}, { message: 'La fecha "desde" debe tener formato de fecha válido (YYYY-MM-DD o ISO8601).' })
  desde?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha "hasta" debe tener formato de fecha válido (YYYY-MM-DD o ISO8601).' })
  hasta?: string;

  @IsIn(['CHOFER', 'VEHICULO'], { message: 'La dimensión debe ser CHOFER o VEHICULO.' })
  dimension!: 'CHOFER' | 'VEHICULO';
}
