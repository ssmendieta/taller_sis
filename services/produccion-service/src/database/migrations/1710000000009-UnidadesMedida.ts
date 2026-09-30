import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 1 — modelo de unidades consistente.
// - Agrega recetas.unidad_producto (unidad del producto terminado).
// - Normaliza materiales.unidad_medida en texto libre al catálogo:
//   kg, g, l, ml, m, cm, unidad, docena, caja, paquete.
// - Idempotente y sin pérdida de datos: los valores no mapeables se dejan
//   en 'unidad' (valor seguro) y se reportan con RAISE NOTICE, sin fallar.
// - No edita migraciones anteriores. Agrega CHECKs solo si no existen.
export class UnidadesMedida1710000000009 implements MigrationInterface {
  name = 'UnidadesMedida1710000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE recetas
        ADD COLUMN IF NOT EXISTS unidad_producto VARCHAR(20) NOT NULL DEFAULT 'unidad';
    `);
    await queryRunner.query(`
      UPDATE recetas SET unidad_producto = 'unidad'
      WHERE unidad_producto IS NULL OR BTRIM(unidad_producto) = '';
    `);

    // Normaliza variantes comunes (minúsculas, sin tildes ni espacios).
    await queryRunner.query(`
      UPDATE materiales SET unidad_medida = CASE
        WHEN LOWER(TRIM(unidad_medida)) IN ('kg','kilo','kilos','kilogramo','kilogramos','kgs') THEN 'kg'
        WHEN LOWER(TRIM(unidad_medida)) IN ('g','gr','grs','gramo','gramos') THEN 'g'
        WHEN LOWER(TRIM(unidad_medida)) IN ('l','lt','lts','litro','litros') THEN 'l'
        WHEN LOWER(TRIM(unidad_medida)) IN ('ml','mililitro','mililitros') THEN 'ml'
        WHEN LOWER(TRIM(unidad_medida)) IN ('m','metro','metros','mt','mts') THEN 'm'
        WHEN LOWER(TRIM(unidad_medida)) IN ('cm','centimetro','centimetros') THEN 'cm'
        WHEN LOWER(TRIM(unidad_medida)) IN ('unidad','unidades','und','ud','u','unid','unids','pieza','piezas','pza') THEN 'unidad'
        WHEN LOWER(TRIM(unidad_medida)) IN ('docena','docenas','doc') THEN 'docena'
        WHEN LOWER(TRIM(unidad_medida)) IN ('caja','cajas') THEN 'caja'
        WHEN LOWER(TRIM(unidad_medida)) IN ('paquete','paquetes','pqt','pqte') THEN 'paquete'
        ELSE unidad_medida
      END;
    `);

    // Reporta y reubica valores no mapeables en la unidad segura 'unidad'.
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT id, codigo, unidad_medida FROM materiales
                 WHERE unidad_medida NOT IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete')
        LOOP
          RAISE NOTICE 'unidades: material id=% codigo=% unidad no mapeable ''%'' -> ''unidad''',
            r.id, r.codigo, r.unidad_medida;
        END LOOP;
        UPDATE materiales SET unidad_medida = 'unidad'
        WHERE unidad_medida NOT IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete');
        UPDATE recetas SET unidad_producto = 'unidad'
        WHERE unidad_producto NOT IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete');
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_materiales_unidad_catalogo') THEN
          ALTER TABLE materiales ADD CONSTRAINT ck_materiales_unidad_catalogo
            CHECK (unidad_medida IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_recetas_unidad_producto_catalogo') THEN
          ALTER TABLE recetas ADD CONSTRAINT ck_recetas_unidad_producto_catalogo
            CHECK (unidad_producto IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete'));
        END IF;
      END $$;
    `);

    // Vistas: exponen la unidad del producto junto a las cantidades.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW vw_orden_materiales_requeridos AS
      SELECT
          o.id AS orden_id,
          o.codigo AS orden_codigo,
          o.cantidad_solicitada,
          r.id AS receta_id,
          r.producto_codigo,
          r.producto_nombre,
          COALESCE(r.unidad_producto, 'unidad') AS unidad_producto,
          m.id AS material_id,
          m.codigo AS material_codigo,
          m.nombre AS material_nombre,
          m.unidad_medida,
          (rm.cantidad_requerida * o.cantidad_solicitada) AS cantidad_requerida
      FROM ordenes_produccion o
      JOIN recetas r ON r.id = o.receta_id
      JOIN receta_material rm ON rm.receta_id = r.id
      JOIN materiales m ON m.id = rm.material_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_recetas_unidad_producto_catalogo') THEN
          ALTER TABLE recetas DROP CONSTRAINT ck_recetas_unidad_producto_catalogo;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_materiales_unidad_catalogo') THEN
          ALTER TABLE materiales DROP CONSTRAINT ck_materiales_unidad_catalogo;
        END IF;
      END $$;
    `);
    await queryRunner.query(`ALTER TABLE recetas DROP COLUMN IF EXISTS unidad_producto;`);
    await queryRunner.query(`
      CREATE OR REPLACE VIEW vw_orden_materiales_requeridos AS
      SELECT
          o.id AS orden_id,
          o.codigo AS orden_codigo,
          o.cantidad_solicitada,
          r.id AS receta_id,
          r.producto_codigo,
          r.producto_nombre,
          m.id AS material_id,
          m.codigo AS material_codigo,
          m.nombre AS material_nombre,
          m.unidad_medida,
          (rm.cantidad_requerida * o.cantidad_solicitada) AS cantidad_requerida
      FROM ordenes_produccion o
      JOIN recetas r ON r.id = o.receta_id
      JOIN receta_material rm ON rm.receta_id = r.id
      JOIN materiales m ON m.id = rm.material_id;
    `);
  }
}
