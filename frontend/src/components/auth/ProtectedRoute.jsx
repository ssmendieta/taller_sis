import { Navigate, useLocation } from "react-router-dom";
import { useSesion } from "../../context/SesionContext.jsx";
import { codigosPermisos } from "../../services/permisos.js";

const MENSAJE_DENEGADO = "Sin permiso para esta sección. Pide acceso al administrador.";

export default function ProtectedRoute({ children, roles, permisos }) {
  const { usuario } = useSesion();
  const location = useLocation();
  if (!usuario) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname, sesionExpirada: true }}
        replace
      />
    );
  }

  if (permisos?.length) {
    const propios = codigosPermisos(usuario);
    const autorizado = permisos.some((p) => propios.includes(p));
    if (!autorizado) {
      return (
        <div className="ts-denied" role="alert">
          <h1>Acceso denegado</h1>
          <p>{MENSAJE_DENEGADO}</p>
        </div>
      );
    }
    return children;
  }

  const nombreRol = typeof usuario.rol === "string" ? usuario.rol : usuario.rol?.nombre;
  if (roles && !roles.includes(nombreRol)) {
    return (
      <div className="ts-denied" role="alert">
        <h1>Acceso denegado</h1>
        <p>{MENSAJE_DENEGADO}</p>
      </div>
    );
  }
  return children;
}
