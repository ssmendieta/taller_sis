export function codigosPermisos(usuario) {
  const permisos = usuario?.permisos ?? [];
  return permisos
    .map((p) => (typeof p === 'string' ? p : p?.codigo))
    .filter(Boolean);
}

export function tienePermiso(usuario, codigo) {
  return codigosPermisos(usuario).includes(codigo);
}

export function tieneAlgunPermiso(usuario, codigos = []) {
  const propios = codigosPermisos(usuario);
  return codigos.some((c) => propios.includes(c));
}
