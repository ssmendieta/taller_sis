import { BadRequestException } from '@nestjs/common';
import { ValidarGuardarRutaPipe } from './validar-guardar-ruta.pipe';

const valido = () => ({
  grupoId: '4',
  fechaProgramada: '2026-11-10',
  vehiculoExternoId: ' VEH-01 ',
  choferExternoId: 'CHO-07',
  paradas: [
    { destino: ' Tienda Central ', boletaIds: ['1', '2'] },
    { destino: 'Sucursal Norte', boletaIds: ['3'] },
  ],
});

describe('ABC-370: validación del cuerpo de una ruta', () => {
  const pipe = new ValidarGuardarRutaPipe();

  it('acepta una ruta válida, recorta textos y conserva el orden de paradas', () => {
    expect(pipe.transform(valido())).toEqual({
      grupoId: '4',
      fechaProgramada: '2026-11-10',
      vehiculoExternoId: 'VEH-01',
      choferExternoId: 'CHO-07',
      paradas: [
        { destino: 'Tienda Central', boletaIds: ['1', '2'] },
        { destino: 'Sucursal Norte', boletaIds: ['3'] },
      ],
    });
  });

  it('permite una ruta sin grupo', () => {
    const { grupoId, ...sinGrupo } = valido();
    expect(pipe.transform(sinGrupo).grupoId).toBeNull();
  });

  it('rechaza cuerpos que no son objeto o con campos extra', () => {
    expect(() => pipe.transform(null)).toThrow(BadRequestException);
    expect(() => pipe.transform([])).toThrow(BadRequestException);
    expect(() => pipe.transform({ ...valido(), estado: 'DESPACHADA' })).toThrow(BadRequestException);
  });

  it('rechaza fecha inválida o inexistente', () => {
    expect(() => pipe.transform({ ...valido(), fechaProgramada: '10/11/2026' })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ...valido(), fechaProgramada: '2026-02-30' })).toThrow(BadRequestException);
  });

  it('exige vehículo y chofer', () => {
    expect(() => pipe.transform({ ...valido(), vehiculoExternoId: '  ' })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ...valido(), choferExternoId: 5 })).toThrow(BadRequestException);
  });

  it('exige al menos una parada con destino y boletas', () => {
    expect(() => pipe.transform({ ...valido(), paradas: [] })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ...valido(), paradas: [{ destino: '', boletaIds: ['1'] }] })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ...valido(), paradas: [{ destino: 'A', boletaIds: [] }] })).toThrow(BadRequestException);
  });

  it('rechaza ids de boleta o grupo no numéricos', () => {
    expect(() => pipe.transform({ ...valido(), grupoId: 4 })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ...valido(), paradas: [{ destino: 'A', boletaIds: ['0'] }] })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ...valido(), paradas: [{ destino: 'A', boletaIds: [7] }] })).toThrow(BadRequestException);
  });

  it('rechaza la misma boleta en dos paradas', () => {
    expect(() => pipe.transform({
      ...valido(),
      paradas: [{ destino: 'A', boletaIds: ['1'] }, { destino: 'B', boletaIds: ['1'] }],
    })).toThrow(new BadRequestException('La boleta 1 está repetida en la ruta'));
  });
});
