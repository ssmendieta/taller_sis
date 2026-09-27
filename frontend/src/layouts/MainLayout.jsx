import { Link, useLocation } from "react-router-dom";
import "../styles/layout.css";

const iconos = {
  inicio: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  produccion: <><path d="M3 20V9l6 3V9l6 3V5h6v15H3Z" /><path d="M7 16h2m4 0h2m3 0h1" /></>,
  ordenes: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  logistica: <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  estado: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  ingresar: <><path d="M13 4h7v16h-7M3 12h13m-4-4 4 4-4 4" /></>,
  auditoria: <><path d="M5 3h14v18H5zM9 8h6m-6 4h6m-6 4h3" /></>,
};

function IconoNavegacion({ nombre }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconos[nombre]}</svg>;
}

export default function MainLayout({ children }) {
  const location = useLocation();
  const isActive = (path) => (location.pathname === path ? "active" : "");
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon" aria-hidden="true">TS</span><span>Taller SIS<small>Producción y logística</small></span></div>
        <p className="nav-label">Navegación</p>
        <nav className="navbar" aria-label="Navegación principal">
          <Link className={isActive("/")} to="/"><IconoNavegacion nombre="inicio" />Inicio</Link>
          <Link className={isActive("/produccion")} to="/produccion"><IconoNavegacion nombre="produccion" />Producción</Link>
          <Link className={isActive("/produccion/ordenes")} to="/produccion/ordenes"><IconoNavegacion nombre="ordenes" />Órdenes</Link>
          <Link className={isActive("/logistica")} to="/logistica"><IconoNavegacion nombre="logistica" />Logística</Link>
          <Link className={isActive("/estado")} to="/estado"><IconoNavegacion nombre="estado" />Estado</Link>
          {import.meta.env.DEV && <Link className={isActive("/auditoria")} to="/auditoria"><IconoNavegacion nombre="auditoria" />Auditoría</Link>}
          <Link className={isActive("/login")} to="/login"><IconoNavegacion nombre="ingresar" />Ingresar</Link>
        </nav>
      </aside>
      <div className="layout-main">
        <header className="layout-topbar"><span className="topbar-mark" aria-hidden="true">▣</span><span className="topbar-section">Gestión de operaciones</span></header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
