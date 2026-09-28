import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { EstadoOrden } from './estado-orden.enum';

export class CambiarEstadoOrdenDto {
  @IsEnum(EstadoOrden)
  nuevoEstado: EstadoOrden;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;

  // TODO: reemplazar por el id del usuario autenticado cuando el
  // PermisosGuard de ABC-151 esté disponible.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usuarioResponsableId: number;
}
