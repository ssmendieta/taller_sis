import { writeFileSync } from 'fs';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { MaterialCalculationService } from '../material-calculation/material-calculation.service';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { OrdenesController } from '../ordenes/ordenes.controller';
import { OrdenesService } from '../ordenes/ordenes.service';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { ConsumosMaterialController } from './consumos-material.controller';
import { ConsumosMaterialService } from './consumos-material.service';
import { ConsumoMaterial } from './entities/consumo-material.entity';

// Preparación: ORD-0001 (receta 10, 100 unidades) y ORD-0002 (misma receta, sin
// consumos). La receta pide por unidad 0.2 kg de harina, 0.05 l de leche y 2 huevos:
// 20 kg, 5 l y 200 unidades. La sal (kg) no está en la receta. Cuenta con permiso
// de consulta y registro, y cuenta sin permiso. Cada caso anota lo esperado.
const CUENTAS = {
  'con-permiso': { id: '42', rol: 'Encargado de Producción', permisos: ['ordenes.consultar', 'materiales.registrar_consumo'] },
  'sin-permiso': { id: '43', rol: 'Logística', permisos: ['logistica.boletas.consultar'] },
};
type Cuenta = keyof typeof CUENTAS | null;

const MATERIALES = [
  { id: 1, codigo: 'HAR-001', nombre: 'Harina', unidadMedida: 'kg' },
  { id: 2, codigo: 'LEC-001', nombre: 'Leche', unidadMedida: 'l' },
  { id: 3, codigo: 'HUE-001', nombre: 'Huevo', unidadMedida: 'unidad' },
  { id: 4, codigo: 'SAL-001', nombre: 'Sal', unidadMedida: 'kg' },
];
const RECETA = [
  { recetaId: 10, materialId: 1, cantidadRequerida: '0.2000' },
  { recetaId: 10, materialId: 2, cantidadRequerida: '0.0500' },
  { recetaId: 10, materialId: 3, cantidadRequerida: '2.0000' },
];
const ORDENES = [
  { id: 1, codigo: 'ORD-0001', producto_id: 10, cantidad: '100.0000' },
  { id: 2, codigo: 'ORD-0002', producto_id: 10, cantidad: '100.0000' },
];

// Aritmética decimal exacta como NUMERIC de PostgreSQL (sin coma flotante).
function escalar(texto: string, escala: number): bigint {
  const negativo = texto.startsWith('-');
  const [entero, decimales = ''] = texto.replace('-', '').split('.');
  const valor = BigInt(entero) * 10n ** BigInt(escala) + BigInt(decimales.padEnd(escala, '0').slice(0, escala) || '0');
  return negativo ? -valor : valor;
}
function texto(valor: bigint, escala: number): string {
  const negativo = valor < 0n;
  const absoluto = (negativo ? -valor : valor).toString().padStart(escala + 1, '0');
  return `${negativo ? '-' : ''}${absoluto.slice(0, -escala)}.${absoluto.slice(-escala)}`;
}

describe('ABC-72: comparación con cero, varios materiales y unidades', () => {
  let app: INestApplication;
  let base: string;
  let consumos: Array<{ id: string; ordenId: string; materialId: string; cantidad: string; unidad: string; usuarioRegistroId: string; fechaHora: Date }>;
  const bitacora: Array<{ paso: string; status: number; respuesta: unknown }> = [];
  const httpFetch = global.fetch;

  // Requerido = receta × cantidad de la orden, como la consulta SQL del servicio.
  function consultaRequeridos() {
    let ordenId = 0;
    const query = {
      innerJoin: () => query, select: () => query, addSelect: () => query, orderBy: () => query,
      where: (_sql: string, params: { ordenId: number }) => { ordenId = params.ordenId; return query; },
      getRawMany: async () => {
        const orden = ORDENES.find((o) => o.id === ordenId);
        return RECETA.filter((r) => r.recetaId === orden?.producto_id).map((r) => {
          const material = MATERIALES.find((m) => m.id === r.materialId)!;
          return {
            materialId: String(material.id), materialCodigo: material.codigo, materialNombre: material.nombre,
            unidad: material.unidadMedida, cantidadRequerida: texto(escalar(r.cantidadRequerida, 4) * escalar(orden!.cantidad, 4), 8),
          };
        });
      },
    };
    return query;
  }

  // Totales de ABC-71: SUM por orden, material y unidad; nunca junta unidades distintas.
  function consultaTotales() {
    const filtro: { ordenId?: string; materialId?: string } = {};
    const query = {
      select: () => query, addSelect: () => query, groupBy: () => query, addGroupBy: () => query,
      orderBy: () => query, addOrderBy: () => query,
      where: (_sql: string, params: { ordenId: string }) => { filtro.ordenId = params.ordenId; return query; },
      andWhere: (_sql: string, params: { materialId: string }) => { filtro.materialId = params.materialId; return query; },
      getRawMany: async () => {
        const grupos = new Map<string, { ordenId: string; materialId: string; unidad: string; suma: bigint }>();
        for (const c of consumos) {
          if (c.ordenId !== filtro.ordenId || (filtro.materialId && c.materialId !== filtro.materialId)) continue;
          const clave = `${c.materialId}|${c.unidad}`;
          const grupo = grupos.get(clave) ?? { ordenId: c.ordenId, materialId: c.materialId, unidad: c.unidad, suma: 0n };
          grupo.suma += escalar(c.cantidad, 4);
          grupos.set(clave, grupo);
        }
        return [...grupos.values()]
          .sort((a, b) => Number(a.materialId) - Number(b.materialId) || a.unidad.localeCompare(b.unidad))
          .map(({ suma, ...grupo }) => ({ ...grupo, cantidadTotal: texto(suma, 4) }));
      },
    };
    return query;
  }

  const repositorios = new Map<unknown, unknown>([
    [OrdenProduccion, { existsBy: async ({ id }: { id: number }) => ORDENES.some((o) => o.id === id), createQueryBuilder: consultaRequeridos }],
    [Material, {
      existsBy: async ({ id }: { id: number }) => MATERIALES.some((m) => m.id === id),
      findOneByOrFail: async ({ id }: { id: number }) => MATERIALES.find((m) => m.id === id) ?? Promise.reject(new Error('Material no encontrado')),
    }],
  ]);
  const manager = {
    findOne: jest.fn(async (entidad: unknown, { where }: { where: Record<string, number> }) => {
      if (entidad === OrdenProduccion) return ORDENES.find((o) => o.id === where.id) ?? null;
      if (entidad === Material) return MATERIALES.find((m) => m.id === where.id) ?? null;
      if (entidad === RecetaMaterial) return RECETA.find((r) => r.recetaId === where.recetaId && r.materialId === where.materialId) ?? null;
      return null;
    }),
    save: jest.fn(async (_entidad: unknown, datos: Record<string, string>) => {
      const guardado = { id: String(consumos.length + 1), ...datos, fechaHora: new Date() } as (typeof consumos)[number];
      consumos.push(guardado);
      return guardado;
    }),
  };
  const dataSource = {
    getRepository: (entidad: unknown) => repositorios.get(entidad),
    transaction: jest.fn(async (callback: (m: typeof manager) => unknown) => callback(manager)),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ConsumosMaterialController, OrdenesController],
      providers: [ConsumosMaterialService, MaterialCalculationService, PermisoProduccionGuard,
        { provide: OrdenesService, useValue: {} },
        { provide: getRepositoryToken(ConsumoMaterial), useValue: { createQueryBuilder: consultaTotales } },
        { provide: DataSource, useValue: dataSource }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    consumos = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const token = (new Headers(init?.headers).get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const cuenta = CUENTAS[token as keyof typeof CUENTAS];
      return cuenta
        ? new Response(JSON.stringify(cuenta), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ message: 'Sesión inválida' }), { status: 401 });
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
    // Con EVIDENCIA_COMPARACION=<ruta> se guardan las respuestas observadas.
    if (process.env.EVIDENCIA_COMPARACION) {
      writeFileSync(process.env.EVIDENCIA_COMPARACION, JSON.stringify(bitacora, null, 2));
    }
  });

  async function comparar(paso: string, ordenId = 1, cuenta: Cuenta = 'con-permiso') {
    const response = await httpFetch(`${base}/ordenes/${ordenId}/comparacion-materiales`, {
      headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    const body = await response.json();
    bitacora.push({ paso, status: response.status, respuesta: body });
    return { status: response.status, body };
  }

  async function registrar(datos: { materialId: number; cantidad: number; unidad: string }, cuenta: Cuenta = 'con-permiso') {
    const response = await httpFetch(`${base}/consumos-material`, {
      method: 'POST',
      headers: { ...(cuenta ? { Authorization: `Bearer ${cuenta}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordenId: 1, ...datos }),
    });
    return { status: response.status, body: await response.json() };
  }

  const fila = (materialId: string, unidad: string, cantidadRequerida: string, cantidadConsumida: string, diferencia: string) =>
    ({ materialId, unidad, cantidadRequerida, cantidadConsumida, diferencia });
  const resumen = (materiales: Array<Record<string, string>>) =>
    materiales.map(({ materialId, unidad, cantidadRequerida, cantidadConsumida, diferencia }) =>
      ({ materialId, unidad, cantidadRequerida, cantidadConsumida, diferencia }));

  describe('orden sin consumo', () => {
    it('válido: ORD-0002 muestra utilizado 0 en cada material, con su unidad y diferencia negativa', async () => {
      const respuesta = await comparar('Orden sin consumo (ORD-0002)', 2);
      expect(respuesta.status).toBe(200);
      expect(resumen(respuesta.body.materiales)).toEqual([
        fila('1', 'kg', '20.0000', '0.0000', '-20.0000'),
        fila('2', 'l', '5.0000', '0.0000', '-5.0000'),
        fila('3', 'unidad', '200.0000', '0.0000', '-200.0000'),
      ]);
    });
  });

  describe('más de un material', () => {
    it('registra por HTTP y compara cada material en su unidad: +3 kg, -0.5 l y 0 unidades', async () => {
      for (const consumo of [
        { materialId: 1, cantidad: 10, unidad: 'kg' },
        { materialId: 1, cantidad: 13, unidad: 'kg' },
        { materialId: 2, cantidad: 0.1, unidad: 'l' },
        { materialId: 2, cantidad: 0.2, unidad: 'l' },
        { materialId: 2, cantidad: 4.2, unidad: 'l' },
        { materialId: 3, cantidad: 200, unidad: 'unidad' },
      ]) {
        expect((await registrar(consumo)).status).toBe(201);
      }

      const respuesta = await comparar('Varios materiales tras registrar consumos (ORD-0001)');
      expect(respuesta.status).toBe(200);
      expect(resumen(respuesta.body.materiales)).toEqual([
        fila('1', 'kg', '20.0000', '23.0000', '3.0000'),
        fila('2', 'l', '5.0000', '4.5000', '-0.5000'),
        fila('3', 'unidad', '200.0000', '200.0000', '0.0000'),
      ]);
    });

    it('cifras exactas: 0.1 + 0.2 l suma 0.3000, sin errores de coma flotante', async () => {
      await registrar({ materialId: 2, cantidad: 0.1, unidad: 'l' });
      await registrar({ materialId: 2, cantidad: 0.2, unidad: 'l' });
      const leche = (await comparar('Suma decimal exacta')).body.materiales.find((m: { materialId: string }) => m.materialId === '2');
      expect(leche).toMatchObject({ cantidadConsumida: '0.3000', diferencia: '-4.7000' });
    });

    it('no inventa requerido: un consumo histórico fuera de la receta aparece con requerido 0', async () => {
      consumos.push({ id: '90', ordenId: '1', materialId: '4', cantidad: '1.5000', unidad: 'kg', usuarioRegistroId: '42', fechaHora: new Date() });
      const respuesta = await comparar('Consumo histórico fuera de la receta');
      expect(respuesta.body.materiales).toHaveLength(4);
      expect(respuesta.body.materiales[3]).toMatchObject(fila('4', 'kg', '0.0000', '1.5000', '1.5000'));
    });
  });

  describe('unidades', () => {
    it('rechazado: registrar harina en g cuando se pide en kg → 400 y no se guarda', async () => {
      const respuesta = await registrar({ materialId: 1, cantidad: 500, unidad: 'g' });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.message).toBe('La unidad del material debe ser kg');
      expect(consumos).toHaveLength(0);
      expect((await comparar('Tras rechazar harina en g')).body.materiales[0]).toMatchObject({ cantidadConsumida: '0.0000' });
    });

    it('rechazado: un material fuera de la receta no se puede registrar → 400', async () => {
      expect((await registrar({ materialId: 4, cantidad: 1, unidad: 'kg' })).status).toBe(400);
      expect(consumos).toHaveLength(0);
    });

    it('rechazado: con un registro histórico en g y otro en kg, la comparación responde 409 sin sumarlos', async () => {
      await registrar({ materialId: 1, cantidad: 10, unidad: 'kg' });
      consumos.push({ id: '91', ordenId: '1', materialId: '1', cantidad: '500.0000', unidad: 'g', usuarioRegistroId: '42', fechaHora: new Date() });

      const respuesta = await comparar('Unidades incompatibles en la harina');
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('No se puede comparar el material 1: consumo en g y requerido en kg');
      expect(respuesta.body).not.toHaveProperty('materiales');
      expect(consumos.map((c) => `${c.cantidad} ${c.unidad}`)).toEqual(['10 kg', '500.0000 g']);
    });
  });

  describe('permisos', () => {
    it('rechazado: la cuenta sin ordenes.consultar no ve la comparación → 403', async () => {
      const respuesta = await comparar('Cuenta sin permiso', 1, 'sin-permiso');
      expect(respuesta.status).toBe(403);
      expect(respuesta.body).not.toHaveProperty('materiales');
    });

    it('la cuenta sin permiso tampoco registra consumos → 403 y no se guarda nada', async () => {
      expect((await registrar({ materialId: 1, cantidad: 10, unidad: 'kg' }, 'sin-permiso')).status).toBe(403);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(consumos).toHaveLength(0);
    });

    it('sin sesión → 401', async () => {
      expect((await comparar('Sin sesión', 1, null)).status).toBe(401);
    });

    it('orden inexistente → 404 sin cifras', async () => {
      const respuesta = await comparar('Orden inexistente', 999);
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).not.toHaveProperty('materiales');
    });
  });
});
