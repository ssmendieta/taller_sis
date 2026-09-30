import { Navigate, useLocation } from "react-router-dom";
import { useSesion } from "../../context/SesionContext.jsx";
import { codigosPermisos } from "../../services/permisos.js";

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
          <p>No tienes permisos para acceder a esta sección. Si lo necesitas, pide acceso al administrador.</p>
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
        <p>No tienes permisos para acceder a esta sección. Si lo necesitas, pide acceso al administrador.</p>
      </div>
    );
  }
  return children;
}
