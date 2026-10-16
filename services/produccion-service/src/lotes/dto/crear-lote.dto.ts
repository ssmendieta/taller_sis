import { IsInt, IsNumber, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

// Responsable y fecha no se reciben: los fija el servidor (sesión y BD).
export class CrearLoteDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;

  @IsString()
  @Matches(/\S/, { message: 'El código de lote es obligatorio' })
  @MaxLength(80)
  codigo: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(9999999999.9999)
  cantidad: number;
}
