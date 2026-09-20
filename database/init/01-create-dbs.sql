-- Fase 2: crear 3 DBs en la misma instancia postgres
-- Este archivo se ejecuta automáticamente al iniciar el contenedor (docker-entrypoint-initdb.d)
-- POSTGRES_DB inicial es auth_db por defecto, aquí creamos las otras dos si no existen

SELECT 'CREATE DATABASE produccion_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'produccion_db')\gexec
SELECT 'CREATE DATABASE logistica_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logistica_db')\gexec
-- auth_db ya existe como POSTGRES_DB, pero aseguramos
SELECT 'CREATE DATABASE auth_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db')\gexec
