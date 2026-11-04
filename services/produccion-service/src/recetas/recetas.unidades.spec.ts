import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRecetaDto } from './dto/create-receta.dto';
import { CreateMaterialDto } from '../materiales/dto/create-material.dto';

describe('unidades: validación de DTOs', () => {
  it('acepta unidad del catálogo en material', async () => {
    const dto = plainToInstance(CreateMaterialDto, { codigo: 'M1', nombre: 'Harina', unidadMedida: 'kg' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza unidad libre en material con mensaje en español', async () => {
    const dto = plainToInstance(CreateMaterialDto, { codigo: 'M1', nombre: 'Harina', unidadMedida: 'kilos' });
    const errores = await validate(dto);
    expect(errores).toHaveLength(1);
    expect(JSON.stringify(errores[0].constraints)).toMatch('unidad válida');
  });

  it('receta sin producto_codigo es válida (autogeneración backend)', async () => {
    const dto = plainToInstance(CreateRecetaDto, { producto_nombre: 'Pan', unidad_producto: 'unidad' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('receta con producto_codigo la respeta (compatibilidad)', async () => {
    const dto = plainToInstance(CreateRecetaDto, {
      producto_codigo: 'PRD-0007',
      producto_nombre: 'Pan',
      unidad_producto: 'kg',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza unidad inválida en receta', async () => {
    const dto = plainToInstance(CreateRecetaDto, { producto_nombre: 'Pan', unidad_producto: 'tonelada' });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
  });
});
