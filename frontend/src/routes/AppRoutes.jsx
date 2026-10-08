import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import LoginPage from "../pages/LoginPage.jsx";
import OrdenesPage from "../pages/OrdenesPage.jsx";
import OrdenDetallePage from "../pages/OrdenDetallePage.jsx";
import ConsultaAuditoriaPage from "../pages/ConsultaAuditoriaPage.jsx";
import RecetasPage from "../pages/RecetasPage.jsx";
import MaterialesPage from "../pages/MaterialesPage.jsx";
import RolesPage from "../pages/RolesPage.jsx";
import UsuarioPage from "../pages/UsuarioPage.jsx";
import LogisticaPage from "../pages/LogisticaPage.jsx";
import MainLayout from "../layouts/MainLayout.jsx";
import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";

const privada = (pagina, permisos) => <ProtectedRoute permisos={permisos}>{pagina}</ProtectedRoute>;

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
      <p>Tu rol aÃºn no tiene funciones. Contacta al administrador.</p>
    </section>
  );
}

function NoEncontrada() {
  const { usuario } = useSesion();
  return (
    <main className="login-page">
      <div className="ts-public" role="alert">
        <h1>PÃ¡gina no encontrada</h1>
        <p>La direcciÃ³n no existe o fue movida.</p>
        <Link className="ts-btn ts-btn-primary" to={usuario ? "/" : "/login"}>Volver</Link>
      </div>
    </main>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* PÃºblica: sin barra lateral ni cabecera del sistema */}
      <Route path="/login" element={<LoginPage />} />
      {/* Autenticadas: solo aquÃ­ se monta el layout con barra lateral */}
      <Route element={<MainLayout><Outlet /></MainLayout>}>
        <Route path="/" element={<InicioRedirect />} />
        <Route path="/ordenes" element={privada(<OrdenesPage />, ["ordenes.consultar"])} />
        <Route path="/ordenes/:id" element={privada(<OrdenDetallePage />, ["ordenes.consultar"])} />
        <Route path="/logistica" element={<LogisticaPage />} />
        <Route path="/recetas" element={privada(<RecetasPage />, ["recetas.gestionar"])} />
        <Route path="/materiales" element={privada(<MaterialesPage />, ["materiales.consultar_disponibilidad", "recetas.gestionar"])} />
        <Route path="/usuarios" element={privada(<UsuarioPage />, ["usuarios.gestionar"])} />
        <Route path="/roles" element={privada(<RolesPage />, ["roles_permisos.gestionar"])} />
        <Route path="/auditoria" element={privada(<ConsultaAuditoriaPage />, ["auditoria.consultar"])} />
        <Route path="/produccion" element={<Navigate to="/ordenes" replace />} />
        <Route path="/produccion/ordenes" element={<Navigate to="/ordenes" replace />} />
        <Route path="/produccion/avances" element={<Navigate to="/ordenes" replace />} />
        <Route path="/logistica" element={<Navigate to="/" replace />} />
      </Route>
      {/* 404 pÃºblico: tampoco monta el layout */}
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}

