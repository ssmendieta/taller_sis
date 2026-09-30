import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { cerrarSesionServidor } from "../services/auth.js";
import { tienePermiso } from "../services/permisos.js";
import "../styles/layout.css";

const iconos = {
  ordenes: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  recetas: <><path d="M5 4h14v12H5z" /><path d="M5 16h14v4H5zM9 8h6M9 11h6" /></>,
  estado: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  ingresar: <><path d="M13 4h7v16h-7M3 12h13m-4-4 4 4-4 4" /></>,
  auditoria: <><path d="M5 3h14v18H5zM9 8h6m-6 4h6m-6 4h3" /></>,
  roles: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4l5 5m0-5l-5 5" /></>,
  usuarios: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 8a3 3 0 1 1 2 5M21 20c0-2.8-1.9-5.1-4.5-5.8" /></>,
};

function IconoNavegacion({ nombre }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconos[nombre]}</svg>;
}

// Menú por rol (Sprint 1):
// - Administrador: Usuarios, Roles y permisos, Auditoría.
// - Encargado de Producción: Órdenes y Recetas (materiales vive dentro de
//   Recetas y del detalle de la orden, sin entrada propia).
// - Supervisor: solo Órdenes (lectura; las acciones se ocultan en la UI).
// - Sin sesión: solo Ingresar.
export default function MainLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, salir } = useSesion();
  const puedeOrdenes = tienePermiso(usuario, "ordenes.consultar");
  const puedeRecetas = tienePermiso(usuario, "recetas.gestionar");
  const puedeRoles = tienePermiso(usuario, "roles_permisos.gestionar");
  const puedeUsuarios = tienePermiso(usuario, "usuarios.gestionar");
  const puedeAuditoria = tienePermiso(usuario, "auditoria.consultar");
  const esAdmin = puedeUsuarios || puedeRoles || puedeAuditoria;
  const activo = (path) => {
    if (path === "/ordenes") return location.pathname === "/ordenes" || location.pathname.startsWith("/ordenes/") ? "active" : "";
    return location.pathname === path ? "active" : "";
  };
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon" aria-hidden="true">TS</span><span>Taller SIS<small>Producción y logística</small></span></div>
        <p className="nav-label">Navegación</p>
        <nav className="navbar" aria-label="Navegación principal">
          {puedeOrdenes && <Link className={activo("/ordenes")} to="/ordenes"><IconoNavegacion nombre="ordenes" />Órdenes</Link>}
          {puedeRecetas && <Link className={activo("/recetas")} to="/recetas"><IconoNavegacion nombre="recetas" />Recetas</Link>}
          {puedeUsuarios && <Link className={activo("/usuarios")} to="/usuarios"><IconoNavegacion nombre="usuarios" />Usuarios</Link>}
          {puedeRoles && <Link className={activo("/roles")} to="/roles"><IconoNavegacion nombre="roles" />Roles y permisos</Link>}
          {puedeAuditoria && <Link className={activo("/auditoria")} to="/auditoria"><IconoNavegacion nombre="auditoria" />Auditoría</Link>}
          {usuario ? <button type="button" className="nav-logout" onClick={async () => { await cerrarSesionServidor(); salir(); navigate("/login", { replace: true }); }}>Cerrar sesión</button>
            : <Link className={activo("/login")} to="/login"><IconoNavegacion nombre="ingresar" />Ingresar</Link>}
        </nav>
        {esAdmin && (
          <p className="nav-foot">
            <Link className={activo("/estado")} to="/estado"><IconoNavegacion nombre="estado" />Estado del sistema</Link>
          </p>
        )}
      </aside>
      <div className="layout-main">
        <header className="layout-topbar"><span className="topbar-mark" aria-hidden="true">▣</span><span className="topbar-section">Gestión de operaciones</span></header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
