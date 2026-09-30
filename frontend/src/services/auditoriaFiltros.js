export function nombreUsuarioAuditoria(registro, tipo) {
  const id = registro[`usuario_${tipo}_id`];
  const nombre = registro[`usuario_${tipo}_nombre`] ?? registro[`usuario_${tipo}`]?.nombre_completo;
  return nombre ?? (id != null ? `Usuario #${id}` : tipo === "actor" ? "Sistema" : "—");
} 

export function diaAuditoria(valor) {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(fecha);
  const campo = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${campo("year")}-${campo("month")}-${campo("day")}`;
}

export function filtrarAuditoria(registros, { usuario = "", accion = "", desde = "", hasta = "" } = {}) {
  return registros.filter((registro) => {
    const fecha = diaAuditoria(registro.fecha_hora);
    const nombres = `${nombreUsuarioAuditoria(registro, "actor")} ${nombreUsuarioAuditoria(registro, "afectado")}`
      .toLocaleLowerCase("es-BO");
    return nombres.includes(usuario.toLocaleLowerCase("es-BO")) &&
      (!accion || registro.accion === accion) &&
      (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
  }).sort((a, b) => (new Date(b.fecha_hora).getTime() || 0) - (new Date(a.fecha_hora).getTime() || 0));
}

export function paginaAuditoria(registros, pagina, tamano) {
  return registros.slice((pagina - 1) * tamano, pagina * tamano);
}
