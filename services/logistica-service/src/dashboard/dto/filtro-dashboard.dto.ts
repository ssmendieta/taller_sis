import { IsDateString, IsOptional } from 'class-validator';

export class FiltroDashboardDto {
  @IsOptional()
  @IsDateString({}, { message: 'La fecha "desde" debe tener formato de fecha válido (YYYY-MM-DD o ISO8601).' })
  desde?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha "hasta" debe tener formato de fecha válido (YYYY-MM-DD o ISO8601).' })
  hasta?: string;
}
