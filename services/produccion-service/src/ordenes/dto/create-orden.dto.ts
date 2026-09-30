import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

export class CreateOrdenDto {
  @IsInt({ message: 'El producto es obligatorio y debe ser un ID válido' })
  @Min(1, { message: 'El producto es obligatorio y debe ser un ID válido' })
  @IsNotEmpty()
  producto_id: number;

  @IsNumber({}, { message: 'La cantidad debe ser mayor a cero' })
  @IsPositive({ message: 'La cantidad debe ser mayor a cero' })
  @IsNotEmpty()
  cantidad: number;

  @IsDateString({}, { message: 'Debe proporcionar una fecha programada válida' })
  @IsNotEmpty()
  fecha_programada: string;

  // D5: el responsable es el usuario autenticado; si se envía, se ignora.
  @IsOptional()
  @IsInt({ message: 'Se requiere el ID del responsable' })
  @Min(1, { message: 'Se requiere el ID del responsable' })
  responsable_id?: number;
}
