export interface DatosAdmin {
  correo: string;
  nombre: string;
  password: string;
}

export function leerDatosAdmin(
  env: Record<string, string | undefined> = process.env,
): DatosAdmin | null {
  const correo = (env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? '';
  const nombre = (env.ADMIN_NOMBRE ?? '').trim();
  if (!correo || !password || !nombre) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return null;
  if (password.length < 8) return null;
  return { correo, nombre, password };
}
