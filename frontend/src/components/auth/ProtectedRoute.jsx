import { Navigate, useLocation } from "react-router-dom";
import { useSesion } from "../../context/SesionContext.jsx";
import { codigosPermisos } from "../../services/permisos.js";

export default function ProtectedRoute({ children, roles, permisos }) {
  const { usuario } = useSesion();
  const location = useLocation();
  if (!usuario) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  if (permisos?.length) {
    const propios = codigosPermisos(usuario);
    const autorizado = permisos.some((p) => propios.includes(p));
    if (!autorizado) {
      return <div role="alert" style={{ padding: "30px" }}>
        <h2>Acceso denegado</h2><p>No tienes permisos para acceder a esta sección.</p>
      </div>;
    }
    return children;
  }

  const nombreRol = typeof usuario.rol === "string" ? usuario.rol : usuario.rol?.nombre;
  if (roles && !roles.includes(nombreRol)) {
    return <div role="alert" style={{ padding: "30px" }}>
      <h2>Acceso denegado</h2><p>No tienes permisos para acceder a esta sección.</p>
    </div>;
  }
  return children;
}
