import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryAuditoriaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  usuario_actor_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  usuario_afectado_id?: string;

  // Filtro general: actor o afectado.
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  usuario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  entidad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entidad_id?: string;

  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;
}
