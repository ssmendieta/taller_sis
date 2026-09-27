import { IsNotEmpty, IsNumber, IsPositive, IsDateString } from 'class-validator';

export class CreateOrdenDto {
  @IsNumber({}, { message: 'El producto es obligatorio y debe ser un ID válido' })
  @IsNotEmpty()
  producto_id: number;

  @IsNumber()
  @IsPositive({ message: 'La cantidad debe ser mayor a cero' })
  @IsNotEmpty()
  cantidad: number;

  @IsDateString({}, { message: 'Debe proporcionar una fecha programada válida' })
  @IsNotEmpty()
  fecha_programada: string;

  @IsNumber({}, { message: 'Se requiere el ID del responsable' })
  @IsNotEmpty()
  responsable_id: number;
}