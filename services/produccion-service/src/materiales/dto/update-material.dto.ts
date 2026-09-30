import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { CreateMaterialDto } from './create-material.dto';

// PUT /materiales/:id: mismas reglas que la creación, con todos los campos
// opcionales. Antes el parámetro era `Partial<CreateMaterialDto>`, que en
// tiempo de ejecución emite `Object` y hace que los pipes lo ignoren
// (el endpoint no validaba nada). Se escribe a mano porque el paquete
// @nestjs/mapped-types no es dependencia de este servicio.
export class UpdateMaterialDto {

  @IsOptional()
  @IsString({ message: 'codigo debe ser una cadena' })
  @IsNotEmpty({ message: 'codigo no puede estar vacío' })
  @MaxLength(80)
  codigo?: CreateMaterialDto['codigo'];

  @IsOptional()
  @IsString({ message: 'nombre debe ser una cadena' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío' })
  @MaxLength(150)
  nombre?: CreateMaterialDto['nombre'];

  @IsOptional()
  @IsString({ message: 'unidadMedida debe ser una cadena' })
  @IsNotEmpty({ message: 'unidadMedida no puede estar vacía' })
  @MaxLength(40)
  unidadMedida?: CreateMaterialDto['unidadMedida'];

}
