SELECT 'CREATE DATABASE produccion_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'produccion_db')\gexec
SELECT 'CREATE DATABASE logistica_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logistica_db')\gexec
SELECT 'CREATE DATABASE auth_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db')\gexec
