import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import "../styles/layout.css";

const iconos = {
  inicio: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  produccion: <><path d="M3 20V9l6 3V9l6 3V5h6v15H3Z" /><path d="M7 16h2m4 0h2m3 0h1" /></>,
  ordenes: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  recetas: <><path d="M5 4h14v12H5z" /><path d="M5 16h14v4H5zM9 8h6M9 11h6" /></>,
  logistica: <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  estado: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  ingresar: <><path d="M13 4h7v16h-7M3 12h13m-4-4 4 4-4 4" /></>,
  auditoria: <><path d="M5 3h14v18H5zM9 8h6m-6 4h6m-6 4h3" /></>,
  roles: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4l5 5m0-5l-5 5" /></>,
  usuarios: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 8a3 3 0 1 1 2 5M21 20c0-2.8-1.9-5.1-4.5-5.8" /></>,
  avances: <><path d="M4 19h16" /><path d="M7 16V9m5 7V5m5 11v-6" /></>,
};

function IconoNavegacion({ nombre }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconos[nombre]}</svg>;
}

export default function MainLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, salir } = useSesion();
  const nombreRol = typeof usuario?.rol === "string" ? usuario.rol : usuario?.rol?.nombre;
  const esAdministrador = nombreRol === "Administrador";
  const esProduccion = nombreRol === "Encargado de Producción";
  const esSupervisor = nombreRol === "Supervisor";
  const isActive = (path) => (location.pathname === path ? "active" : "");
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon" aria-hidden="true">TS</span><span>Taller SIS<small>Producción y logística</small></span></div>
        <p className="nav-label">Navegación</p>
        <nav className="navbar" aria-label="Navegación principal">
          <Link className={isActive("/")} to="/"><IconoNavegacion nombre="inicio" />Inicio</Link>
          {esProduccion && <Link className={isActive("/produccion")} to="/produccion"><IconoNavegacion nombre="produccion" />Producción</Link>}
          {(esSupervisor || esProduccion) && <Link className={isActive("/produccion/ordenes")} to="/produccion/ordenes"><IconoNavegacion nombre="ordenes" />Órdenes</Link>}
          {esProduccion && <Link className={isActive("/ordenes")} to="/ordenes"><IconoNavegacion nombre="ordenes" />Nueva orden</Link>}
          {esProduccion && <Link className={isActive("/produccion/avances")} to="/produccion/avances"><IconoNavegacion nombre="avances" />Avances</Link>}
          {esProduccion && <Link className={isActive("/recetas")} to="/recetas"><IconoNavegacion nombre="recetas" />Recetas</Link>}
          {esAdministrador && <Link className={isActive("/roles")} to="/roles"><IconoNavegacion nombre="roles" />Roles</Link>}
          {esAdministrador && <Link className={isActive("/usuarios")} to="/usuarios"><IconoNavegacion nombre="usuarios" />Usuarios</Link>}
          {nombreRol === "Encargado de Logística" && <Link className={isActive("/logistica")} to="/logistica"><IconoNavegacion nombre="logistica" />Logística</Link>}
          <Link className={isActive("/estado")} to="/estado"><IconoNavegacion nombre="estado" />Estado</Link>
          {esAdministrador && <Link className={isActive("/auditoria")} to="/auditoria"><IconoNavegacion nombre="auditoria" />Auditoría</Link>}
          {usuario ? <button type="button" className="nav-logout" onClick={() => { salir(); navigate("/login", { replace: true }); }}>Cerrar sesión</button>
            : <Link className={isActive("/login")} to="/login"><IconoNavegacion nombre="ingresar" />Ingresar</Link>}
        </nav>
      </aside>
      <div className="layout-main">
        <header className="layout-topbar"><span className="topbar-mark" aria-hidden="true">▣</span><span className="topbar-section">Gestión de operaciones</span></header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
