import { TIMEOUT_ERP_RECURSOS_MS } from '../dto/recursos-logisticos-v1';

export const ERP_RECURSOS_CONFIG = Symbol('ERP_RECURSOS_CONFIG');

export interface ErpRecursosConfig {
  // null si no está configurado: el cliente responde NO_DISPONIBLE o CREDENCIALES sin llamar al ERP.
  url: string | null;
  token: string | null;
  timeoutMs: number;
  // Reintentos solo para fallos transitorios (timeout, red, 5xx); acotados a 3.
  reintentos: number;
  esperaReintentoMs: number;
}

export const REINTENTOS_ERP_RECURSOS = 2;
export const ESPERA_REINTENTO_ERP_RECURSOS_MS = 200;

function entero(env: NodeJS.ProcessEnv, nombre: string, porDefecto: number, min: number, max: number): number {
  const texto = env[nombre]?.trim();
  if (!texto) return porDefecto;
  const valor = Number(texto);
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new Error(`${nombre} debe ser un entero entre ${min} y ${max}`);
  }
  return valor;
}

export function loadErpRecursosConfig(env: NodeJS.ProcessEnv = process.env): ErpRecursosConfig {
  const url = env.ERP_RECURSOS_URL?.trim() || null;
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) {
    throw new Error('ERP_RECURSOS_URL debe ser una URL http o https');
  }
  return {
    url,
    token: env.ERP_RECURSOS_TOKEN?.trim() || null,
    timeoutMs: entero(env, 'ERP_RECURSOS_TIMEOUT_MS', TIMEOUT_ERP_RECURSOS_MS, 100, 30000),
    reintentos: entero(env, 'ERP_RECURSOS_REINTENTOS', REINTENTOS_ERP_RECURSOS, 0, 3),
    esperaReintentoMs: entero(env, 'ERP_RECURSOS_ESPERA_REINTENTO_MS', ESPERA_REINTENTO_ERP_RECURSOS_MS, 0, 5000),
  };
}
