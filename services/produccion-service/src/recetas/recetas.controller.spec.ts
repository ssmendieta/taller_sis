import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { RecetasController } from './recetas.controller';
import { CrearVersionRecetaDto } from './dto/crear-version-receta.dto';

describe('RecetasController.crearVersion (ABC-137)', () => {
  let controller: RecetasController;

  const crearNuevaVersion = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new RecetasController(
      {} as never,
      { crearNuevaVersion } as never,
    );
  });

  it('delega en RecetasVersionService con el mapeo snake_case -> camelCase', async () => {
    crearNuevaVersion.mockResolvedValue({ id: 9, activa: true });

    const resultado = await controller.crearVersion(3, {
      producto_nombre: 'Pan integral v2',
      materiales: [{ material_id: 1, cantidad_requerida: 2.5 }],
    });

    expect(crearNuevaVersion).toHaveBeenCalledWith(3, 'Pan integral v2', [
      { materialId: 1, cantidadRequerida: 2.5 },
    ]);
    expect(resultado).toEqual({ id: 9, activa: true });
  });

  describe('validación del DTO', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    // Misma configuración que aplica el ValidationPipe de la clase controlador.
    function validar(dto: unknown) {
      return pipe.transform(dto, {
        type: 'body',
        metatype: CrearVersionRecetaDto,
      });
    }

    const valido = () => ({
      producto_nombre: 'Pan integral v2',
      materiales: [{ material_id: 1, cantidad_requerida: 2.5 }],
    });

    it('acepta un cuerpo válido', async () => {
      await expect(validar(valido())).resolves.toMatchObject({
        producto_nombre: 'Pan integral v2',
      });
    });

    it('rechaza producto_nombre vacío', async () => {
      await expect(
        validar({ ...valido(), producto_nombre: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza materiales vacíos', async () => {
      await expect(
        validar({ ...valido(), materiales: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un material sin cantidad positiva', async () => {
      await expect(
        validar({
          ...valido(),
          materiales: [{ material_id: 1, cantidad_requerida: 0 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza campos desconocidos', async () => {
      await expect(
        validar({ ...valido(), extra: 'no permitido' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
