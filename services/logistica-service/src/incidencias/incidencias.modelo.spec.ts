import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { CrearIncidenciasTransporte1710000000009 } from '../database/migrations/1710000000009-CrearIncidenciasTransporte';
import { RutaParada } from '../rutas/entities/ruta-parada.entity';
import { Ruta } from '../rutas/entities/ruta.entity';
import { IncidenciaTransporte } from './entities/incidencia-transporte.entity';
import { ReprogramacionRuta } from './entities/reprogramacion-ruta.entity';
import { TipoIncidencia } from './entities/tipo-incidencia.enum';

const metadatos = getMetadataArgsStorage();
const columnas = (entidad: Function) => metadatos.columns.filter((c) => c.target === entidad);
const columna = (entidad: Function, propiedad: string) => columnas(entidad).find((c) => c.propertyName === propiedad);
const checks = (entidad: Function) => metadatos.checks.filter((c) => c.target === entidad).map((c) => c.name);
const relacion = (entidad: Function, propiedad: string) =>
  metadatos.relations.find((r) => r.target === entidad && r.propertyName === propiedad);

async function sqlDe(metodo: 'up' | 'down') {
  const query = jest.fn().mockResolvedValue(undefined);
  await new CrearIncidenciasTransporte1710000000009()[metodo]({ query } as any);
  return query.mock.calls.map(([sql]) => sql as string);
}

describe('ABC-380: modelo de incidencia de transporte y reprogramación', () => {
  it('registra las tablas incidencias_transporte y rutas_reprogramaciones', () => {
    expect(metadatos.tables.some((t) => t.target === IncidenciaTransporte && t.name === 'incidencias_transporte')).toBe(true);
    expect(metadatos.tables.some((t) => t.target === ReprogramacionRuta && t.name === 'rutas_reprogramaciones')).toBe(true);
  });

  it('la incidencia guarda ruta, entrega opcional, tipo, motivo, autor y fecha', () => {
    expect(columnas(IncidenciaTransporte).map((c) => c.options.name ?? c.propertyName)).toEqual(expect.arrayContaining([
      'ruta_id', 'parada_id', 'tipo', 'motivo', 'registrada_por_usuario_id', 'registrada_en',
    ]));
    expect(columna(IncidenciaTransporte, 'paradaId')?.options.nullable).toBe(true);
    expect(columna(IncidenciaTransporte, 'rutaId')?.options.nullable).toBeFalsy();
    expect(columna(IncidenciaTransporte, 'motivo')?.options.length).toBe(500);
    expect(columna(IncidenciaTransporte, 'registradaEn')?.mode).toBe('createDate');
    expect(relacion(IncidenciaTransporte, 'ruta')?.relationType).toBe('many-to-one');
    expect((relacion(IncidenciaTransporte, 'ruta')?.type as () => Function)()).toBe(Ruta);
    expect((relacion(IncidenciaTransporte, 'parada')?.type as () => Function)()).toBe(RutaParada);
  });

  it('la reprogramación guarda fecha anterior y nueva, motivo, autor, fecha e incidencia opcional', () => {
    expect(columnas(ReprogramacionRuta).map((c) => c.options.name ?? c.propertyName)).toEqual(expect.arrayContaining([
      'ruta_id', 'incidencia_id', 'fecha_anterior', 'fecha_nueva', 'motivo', 'registrada_por_usuario_id', 'registrada_en',
    ]));
    expect(columna(ReprogramacionRuta, 'fechaAnterior')?.options.type).toBe('date');
    expect(columna(ReprogramacionRuta, 'fechaNueva')?.options.type).toBe('date');
    expect(columna(ReprogramacionRuta, 'incidenciaId')?.options.nullable).toBe(true);
    expect((relacion(ReprogramacionRuta, 'incidencia')?.type as () => Function)()).toBe(IncidenciaTransporte);
  });

  it('las entidades declaran las mismas restricciones que la migración', () => {
    expect(checks(IncidenciaTransporte)).toEqual(expect.arrayContaining([
      'ck_incidencia_transporte_tipo', 'ck_incidencia_transporte_motivo', 'ck_incidencia_transporte_autor',
    ]));
    expect(checks(ReprogramacionRuta)).toEqual(expect.arrayContaining([
      'ck_ruta_reprogramacion_fechas', 'ck_ruta_reprogramacion_motivo', 'ck_ruta_reprogramacion_autor',
    ]));
    expect(metadatos.uniques.filter((u) => u.target === RutaParada).map((u) => u.name)).toContain('uq_ruta_parada_id_ruta');
  });

  it('el CHECK de tipo de la migración coincide con el enum', async () => {
    const sql = (await sqlDe('up')).join('\n');
    const lista = /tipo IN \(([^)]+)\)/.exec(sql)![1].split(',').map((valor) => valor.trim().replace(/'/g, ''));
    expect(lista).toEqual(Object.values(TipoIncidencia));
  });

  it('la migración exige parada e incidencia de la misma ruta y no borra historial', async () => {
    const sql = (await sqlDe('up')).join('\n');
    expect(sql).toContain('ALTER TABLE rutas_paradas ADD CONSTRAINT uq_ruta_parada_id_ruta UNIQUE (id, ruta_id)');
    expect(sql).toContain('CREATE TABLE incidencias_transporte (');
    expect(sql).toContain('CREATE TABLE rutas_reprogramaciones (');
    expect(sql).toMatch(/FOREIGN KEY \(parada_id, ruta_id\)\s+REFERENCES rutas_paradas\(id, ruta_id\) ON DELETE SET NULL \(parada_id\)/);
    expect(sql).toMatch(/FOREIGN KEY \(incidencia_id, ruta_id\)\s+REFERENCES incidencias_transporte\(id, ruta_id\) ON DELETE RESTRICT/);
    expect(sql.match(/REFERENCES rutas\(id\) ON DELETE RESTRICT/g)).toHaveLength(2);
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
    expect(sql).toContain('CHECK (fecha_nueva <> fecha_anterior)');
  });

  it('la reversión borra en orden inverso y quita la restricción agregada', async () => {
    expect(await sqlDe('down')).toEqual([
      'DROP TABLE rutas_reprogramaciones;',
      'DROP TABLE incidencias_transporte;',
      'ALTER TABLE rutas_paradas DROP CONSTRAINT uq_ruta_parada_id_ruta;',
    ]);
  });
});
