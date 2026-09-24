import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsString,
  MinLength,
} from 'class-validator';


export class CreateUserDto {


  @IsString({
    message: 'El nombre debe ser texto',
  })
  @IsNotEmpty({
    message: 'El nombre completo es obligatorio',
  })
  nombreCompleto: string;



  @IsEmail(
    {},
    {
      message: 'El correo electrónico no tiene un formato válido',
    },
  )
  @IsNotEmpty({
    message: 'El correo es obligatorio',
  })
  correo: string;



  @IsString({
    message: 'La contraseña debe ser texto',
  })
  @MinLength(6, {
    message: 'La contraseña debe tener mínimo 6 caracteres',
  })
  @IsNotEmpty({
    message: 'La contraseña es obligatoria',
  })
  password: string;



  @IsNumber(
    {},
    {
      message: 'El rol debe ser un número',
    },
  )
  @IsNotEmpty({
    message: 'El rol es obligatorio',
  })
  rolId: number;

}