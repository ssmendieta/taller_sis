import { IsNumber, IsString, Matches, Max, Min } from 'class-validator';

export class RegistrarReprocesoDto {
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  resultadoCalidadId: string;

  @IsNumber()
  @Min(0.0001)
  @Max(9999999999.9999)
  cantidadProcesada: number;

  @IsNumber()
  @Min(0)
  @Max(9999999999.9999)
  cantidadRecuperada: number;

  @IsNumber()
  @Min(0)
  @Max(9999999999.9999)
  cantidadDescartada: number;
}
