import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { Demandas1710000000024 } from '../database/migrations/1710000000024-Demandas';
import { EstadoConfirmadaDemanda1710000000026 } from '../database/migrations/1710000000026-EstadoConfirmadaDemanda';
import { RelacionOrdenDemanda1710000000032 } from '../database/migrations/1710000000032-RelacionOrdenDemanda';
import { DemandaItem } from '../demanda/entities/demanda-item.entity';
import { Demanda } from '../demanda/entities/demanda.entity';
import { OrdenProduccion } from './entities/orden-produccion.entity';

async function sqlDe(paso: 'up' | 'down'): Promise<string> {
  const query = jest.fn(async (_sql: string) => undefined);
  await new RelacionOrdenDemanda1710000000032()[paso]({ query } as unknown as QueryRunner);
  return query.mock.calls.map(([sql]) => String(sql)).join('\n');
}

describe('ABC-443: metadatos de relación orden–demanda', () => {
  it('agrega demanda_id nullable y relación bidireccional con Demanda', async () => {
    const source = new DataSource({
      type: 'postgres',
      entities: [OrdenProduccion, Demanda, DemandaItem],
    });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    const ordenMeta = source.getMetadata(OrdenProduccion);
    const demandaMeta = source.getMetadata(Demanda);

    const col = ordenMeta.findColumnWithPropertyName('demanda_id');
    expect(col).toMatchObject({ databaseName: 'demanda_id', type: 'bigint', isNullable: true });
    expect(ordenMeta.indices.map((i) => i.name)).toContain('ix_ordenes_demanda');

    const relOrden = ordenMeta.findRelationWithPropertyPath('demanda');
    expect(relOrden).toMatchObject({ onDelete: 'RESTRICT', isNullable: true });
    expect(relOrden?.inverseEntityMetadata.target).toBe(Demanda);
    expect(ordenMeta.foreignKeys.map((fk) => fk.name)).toContain('fk_orden_demanda');

    const relDemanda = demandaMeta.findRelationWithPropertyPath('ordenes');
    expect(relDemanda?.inverseEntityMetadata.target).toBe(OrdenProduccion);
  });
});

describe('ABC-443: migración RelacionOrdenDemanda1710000000032', () => {
  it('agrega columna demanda_id nullable, FK a demandas e índice', async () => {
    const sql = await sqlDe('up');
    expect(sql).toContain('ALTER TABLE ordenes_produccion');
    expect(sql).toContain('ADD COLUMN demanda_id BIGINT NULL');
    expect(sql).toContain('ADD CONSTRAINT fk_orden_demanda FOREIGN KEY (demanda_id) REFERENCES demandas(id) ON DELETE RESTRICT');
    expect(sql).toContain('CREATE INDEX ix_ordenes_demanda ON ordenes_produccion (demanda_id);');
  });

  it('la reversión elimina índice, FK y columna sin borrar órdenes', async () => {
    const sql = await sqlDe('down');
    expect(sql).toContain('DROP INDEX IF EXISTS ix_ordenes_demanda;');
    expect(sql).toContain('ALTER TABLE ordenes_produccion DROP CONSTRAINT IF EXISTS fk_orden_demanda;');
    expect(sql).toContain('ALTER TABLE ordenes_produccion DROP COLUMN IF EXISTS demanda_id;');
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
  });
});

// ORDENES_DB_REAL=1 habilita verificación contra PostgreSQL real en un esquema aislado.
const describeReal = process.env.ORDENES_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-443: migración up/down en PostgreSQL real', () => {
  const schema = `abc443_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let schemaCreado = false;

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      entities: [OrdenProduccion, Demanda, DemandaItem],
      migrations: [],
    });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new ProduccionSchema1710000000002().up(runner);
      await new OrdenesCodigoSecuencia1710000000007().up(runner);
      await new Demandas1710000000024().up(runner);
      await new EstadoConfirmadaDemanda1710000000026().up(runner);
      await runner.query("INSERT INTO recetas (producto_codigo, producto_nombre) VALUES ('PROD-1', 'Producto 1')");
      await runner.commitTransaction();
      schemaCreado = true;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  });

  afterAll(async () => {
    if (source?.isInitialized) {
      if (schemaCreado) {
        await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
      await source.destroy();
    }
  });

  it('sube y baja sobre órdenes existentes sin perder datos y respeta FK', async () => {
    const runner = source.createQueryRunner();
    try {
      await runner.query(`SET search_path TO "${schema}"`);
      // 1. Orden manual existente antes de la migración.
      await runner.query(`
        INSERT INTO ordenes_produccion (codigo, receta_id, cantidad_solicitada, fecha_programada, responsable_usuario_id)
        VALUES ('ORD-MANUAL-1', 1, 10, '2026-12-01', 1)
      `);

      // 2. Aplicar migración up sobre datos existentes.
      await new RelacionOrdenDemanda1710000000032().up(runner);

      const manuales = await runner.query(
        "SELECT codigo, demanda_id FROM ordenes_produccion WHERE codigo = 'ORD-MANUAL-1'",
      );
      expect(manuales).toHaveLength(1);
      expect(manuales[0].demanda_id).toBeNull();

      // 3. Crear demanda confirmada y vincular nueva orden; rechazar demanda inexistente.
      const eventId = randomUUID();
      const correlationId = randomUUID();
      const [demanda] = await runner.query(
        `INSERT INTO demandas (origen, demanda_externa_id, fecha_requerida, estado, event_id, correlation_id, contenido_hash)
         VALUES ('VENTAS', 'PED-443-1', '2026-12-05', 'CONFIRMADA', $1, $2, $3) RETURNING id`,
        [eventId, correlationId, 'a'.repeat(64)],
      );

      await runner.query(
        `INSERT INTO ordenes_produccion (codigo, receta_id, cantidad_solicitada, fecha_programada, responsable_usuario_id, demanda_id)
         VALUES ('ORD-DEM-1', 1, 5, '2026-12-05', 1, $1)`,
        [demanda.id],
      );

      await expect(
        runner.query(
          `INSERT INTO ordenes_produccion (codigo, receta_id, cantidad_solicitada, fecha_programada, responsable_usuario_id, demanda_id)
           VALUES ('ORD-INVALIDA', 1, 5, '2026-12-05', 1, 999999)`,
        ),
      ).rejects.toThrow();

      // 4. Revertir migración down sin perder las órdenes existentes.
      await new RelacionOrdenDemanda1710000000032().down(runner);

      const sobrevivientes = await runner.query(
        "SELECT codigo FROM ordenes_produccion WHERE codigo IN ('ORD-MANUAL-1', 'ORD-DEM-1') ORDER BY codigo",
      );
      expect(sobrevivientes.map((r: { codigo: string }) => r.codigo)).toEqual(['ORD-DEM-1', 'ORD-MANUAL-1']);

      // 5. Reaplicar en limpio para dejar el esquema listo.
      await new RelacionOrdenDemanda1710000000032().up(runner);
    } finally {
      await runner.release();
    }
  });
});
