
import { Link, Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import LoginPage from "../pages/LoginPage.jsx";
import OrdenesPage from "../pages/OrdenesPage.jsx";
import OrdenDetallePage from "../pages/OrdenDetallePage.jsx";
import ConsultaAuditoriaPage from "../pages/ConsultaAuditoriaPage.jsx";
import RecetasPage from "../pages/RecetasPage.jsx";
import MaterialesPage from "../pages/MaterialesPage.jsx";
import RolesPage from "../pages/RolesPage.jsx";
import UsuarioPage from "../pages/UsuarioPage.jsx";
import SolicitudesMaterialPage from "../pages/SolicitudesMaterialPage.jsx";
import IntegracionesPage from "../pages/IntegracionesPage.jsx";
import BoletaDetallePage from "../pages/BoletaDetallePage.jsx";
import BoletasPage from "../pages/BoletasPage.jsx";
import MainLayout from "../layouts/MainLayout.jsx";
import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { PERMISO_INTEGRACIONES } from "../services/integracionesService.js";
import { PERMISO_CONSULTAR_BOLETAS } from "../services/boletasService.js";

const privada = (pagina, permisos) => (
  <ProtectedRoute permisos={permisos}>{pagina}</ProtectedRoute>
);

function InicioRedirect() {
  const { usuario } = useSesion();
  const location = useLocation();

  if (!usuario) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (tienePermiso(usuario, "usuarios.gestionar")) {
    return <Navigate to="/usuarios" replace />;
  }

  if (tienePermiso(usuario, "ordenes.consultar")) {
    return <Navigate to="/ordenes" replace />;
  }

  // Logística y roles de solo lectura de boletas (consultar no permite crear ni emitir).
  if (tienePermiso(usuario, PERMISO_CONSULTAR_BOLETAS)) {
    return <Navigate to="/logistica/boletas" replace />;
  }

  if (tienePermiso(usuario, "auditoria.consultar")) {
    return <Navigate to="/auditoria" replace />;
  }

  if (tienePermiso(usuario, "roles_permisos.gestionar")) {
    return <Navigate to="/roles" replace />;
  }

  return (
    <section className="ts-page" aria-labelledby="sin-funciones">
      <h1 id="sin-funciones">Sin funciones asignadas</h1>
      <p>Tu rol aún no tiene funciones. Contacta al administrador.</p>
    </section>
  );
}

// Consulta documental orden → lotes → boletas: la pantalla es de otra subtarea de la HU.
// Al integrarla, reemplazar este aviso por esa página en la misma ruta y permiso.
function TrazabilidadPendiente() {
  const { id } = useParams();

  return (
    <section className="ts-page" aria-labelledby="trazabilidad-titulo">
      <div className="ts-feedback ts-notice" role="status">
        <h1 id="trazabilidad-titulo">Trazabilidad documental</h1>
        <p>La consulta de lotes y boletas de esta orden todavía no está disponible.</p>
        <Link className="ts-btn" to={`/ordenes/${id}`}>
          Volver a la orden
        </Link>
      </div>
    </section>
  );
}

function NoEncontrada() {
  const { usuario } = useSesion();

  return (
    <main className="login-page">
      <div className="ts-public" role="alert">
        <h1>Página no encontrada</h1>
        <p>La dirección no existe o fue movida.</p>
        <Link
          className="ts-btn ts-btn-primary"
          to={usuario ? "/" : "/login"}
        >
          Volver
        </Link>
      </div>
    </main>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Página pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Páginas autenticadas */}
      <Route element={<MainLayout><Outlet /></MainLayout>}>
        <Route path="/" element={<InicioRedirect />} />

        <Route
          path="/ordenes"
          element={privada(<OrdenesPage />, ["ordenes.consultar"])}
        />

        <Route
          path="/ordenes/:id"
          element={privada(<OrdenDetallePage />, ["ordenes.consultar"])}
        />

        {/* Enlace desde el detalle de la orden; ve boletas, así que exige su permiso de consulta. */}
        <Route
          path="/ordenes/:id/trazabilidad"
          element={privada(<TrazabilidadPendiente />, [PERMISO_CONSULTAR_BOLETAS])}
        />

        <Route
          path="/recetas"
          element={privada(<RecetasPage />, ["recetas.gestionar"])}
        />

        <Route
          path="/materiales"
          element={privada(
            <MaterialesPage />,
            ["materiales.consultar_disponibilidad", "recetas.gestionar"]
          )}
        />

        <Route
          path="/solicitudes-material"
          element={privada(
            <SolicitudesMaterialPage />,
            ["materiales.solicitar", "materiales.consultar_disponibilidad"]
          )}
        />

        <Route
          path="/usuarios"
          element={privada(<UsuarioPage />, ["usuarios.gestionar"])}
        />

        <Route
          path="/roles"
          element={privada(<RolesPage />, ["roles_permisos.gestionar"])}
        />

        <Route
          path="/auditoria"
          element={privada(<ConsultaAuditoriaPage />, ["auditoria.consultar"])}
        />

        {/* ABC-268: solo con integraciones.reintentar; la API vuelve a exigirlo. */}
        <Route
          path="/integraciones"
          element={privada(<IntegracionesPage />, [PERMISO_INTEGRACIONES])}
        />

        {/* Lista de boletas y vista/impresión de una boleta guardada (solo lectura). */}
        <Route
          path="/logistica/boletas"
          element={privada(<BoletasPage />, [PERMISO_CONSULTAR_BOLETAS])}
        />

        <Route
          path="/logistica/boletas/:id"
          element={privada(<BoletaDetallePage />, [PERMISO_CONSULTAR_BOLETAS])}
        />

        <Route path="/produccion" element={<Navigate to="/ordenes" replace />} />
        <Route path="/produccion/ordenes" element={<Navigate to="/ordenes" replace />} />
        <Route path="/produccion/avances" element={<Navigate to="/ordenes" replace />} />
        <Route path="/logistica" element={<Navigate to="/" replace />} />
      </Route>

      {/* Página no encontrada */}
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
