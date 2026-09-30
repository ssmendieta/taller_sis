import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import LoginPage from "../pages/LoginPage.jsx";
import OrdenesPage from "../pages/OrdenesPage.jsx";
import OrdenDetallePage from "../pages/OrdenDetallePage.jsx";
import ConsultaAuditoriaPage from "../pages/ConsultaAuditoriaPage.jsx";
import RecetasPage from "../pages/RecetasPage.jsx";
import MaterialesPage from "../pages/MaterialesPage.jsx";
import RolesPage from "../pages/RolesPage.jsx";
import UsuarioPage from "../pages/UsuarioPage.jsx";
import SystemStatusPage from "../pages/SystemStatusPage.jsx";
import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";

const privada = (pagina, permisos) => <ProtectedRoute permisos={permisos}>{pagina}</ProtectedRoute>;

// Aterrizaje por rol (Sprint 1):
// - Administrador -> /usuarios
// - Encargado de Producción y Supervisor -> /ordenes
// - Encargado de Logística (sin funciones en el Sprint 1) -> mensaje, sin menú.
function InicioRedirect() {
  const { usuario } = useSesion();
  const location = useLocation();
  if (!usuario) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (tienePermiso(usuario, "usuarios.gestionar")) return <Navigate to="/usuarios" replace />;
  if (tienePermiso(usuario, "ordenes.consultar")) return <Navigate to="/ordenes" replace />;
  if (tienePermiso(usuario, "auditoria.consultar")) return <Navigate to="/auditoria" replace />;
  if (tienePermiso(usuario, "roles_permisos.gestionar")) return <Navigate to="/roles" replace />;
  return (
    <section className="ts-page" aria-labelledby="sin-funciones">
      <h1 id="sin-funciones">Sin funciones asignadas</h1>
      <p>Tu rol aún no tiene funciones en este sprint. Si necesitas acceso, contacta al administrador.</p>
    </section>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<InicioRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/ordenes" element={privada(<OrdenesPage />, ["ordenes.consultar"])} />
      <Route path="/ordenes/:id" element={privada(<OrdenDetallePage />, ["ordenes.consultar"])} />
      <Route path="/recetas" element={privada(<RecetasPage />, ["recetas.gestionar"])} />
      <Route path="/materiales" element={privada(<MaterialesPage />, ["materiales.consultar_disponibilidad", "recetas.gestionar"])} />
      <Route path="/usuarios" element={privada(<UsuarioPage />, ["usuarios.gestionar"])} />
      <Route path="/roles" element={privada(<RolesPage />, ["roles_permisos.gestionar"])} />
      <Route path="/auditoria" element={privada(<ConsultaAuditoriaPage />, ["auditoria.consultar"])} />
      <Route path="/estado" element={privada(<SystemStatusPage />, ["usuarios.gestionar", "roles_permisos.gestionar", "auditoria.consultar"])} />
      {/* Compatibilidad con rutas anteriores del Sprint 1 */}
      <Route path="/produccion" element={<Navigate to="/ordenes" replace />} />
      <Route path="/produccion/ordenes" element={<Navigate to="/ordenes" replace />} />
      <Route path="/produccion/avances" element={<Navigate to="/ordenes" replace />} />
      <Route path="/logistica" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
