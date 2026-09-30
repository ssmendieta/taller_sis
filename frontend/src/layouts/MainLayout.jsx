import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import Logo from "../components/Logo.jsx";
import { NOMBRE_SISTEMA } from "../constants/marca.js";
import { cerrarSesionServidor } from "../services/auth.js";
import { tienePermiso } from "../services/permisos.js";
import "../styles/layout.css";

const iconos = {
  ordenes: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  recetas: <><path d="M5 4h14v12H5z" /><path d="M5 16h14v4H5zM9 8h6M9 11h6" /></>,
  auditoria: <><path d="M5 3h14v18H5zM9 8h6m-6 4h6m-6 4h3" /></>,
  roles: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4l5 5m0-5l-5 5" /></>,
  usuarios: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 8a3 3 0 1 1 2 5M21 20c0-2.8-1.9-5.1-4.5-5.8" /></>,
};

function IconoNavegacion({ nombre }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconos[nombre]}</svg>;
}

// Solo se monta dentro de rutas autenticadas. /login y 404 quedan fuera.
export default function MainLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, salir } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const puedeOrdenes = tienePermiso(usuario, "ordenes.consultar");
  const puedeRecetas = tienePermiso(usuario, "recetas.gestionar");
  const puedeRoles = tienePermiso(usuario, "roles_permisos.gestionar");
  const puedeUsuarios = tienePermiso(usuario, "usuarios.gestionar");
  const puedeAuditoria = tienePermiso(usuario, "auditoria.consultar");
  const activo = (path) => {
    if (path === "/ordenes") return location.pathname === "/ordenes" || location.pathname.startsWith("/ordenes/") ? "active" : "";
    return location.pathname === path ? "active" : "";
  };
  const nombre = usuario?.nombre_completo ?? usuario?.nombre ?? usuario?.correo ?? "";
  const rol = typeof usuario?.rol === "string" ? usuario.rol : (usuario?.rol?.nombre ?? "");
  return (
    <div className="layout">
      <aside className="sidebar" data-open={abierto ? "true" : "false"} aria-label="Barra lateral">
        <div className="sidebar-top">
          <Link to="/" className="brand-link" aria-label={NOMBRE_SISTEMA} style={{ textDecoration: "none" }}><Logo /></Link>
          <button type="button" className="menu-toggle" aria-expanded={abierto} aria-label={abierto ? "Cerrar menú" : "Abrir menú"} onClick={() => setAbierto((v) => !v)}>☰</button>
        </div>
        <nav className="navbar" aria-label="Navegación principal">
          {puedeOrdenes && <Link className={activo("/ordenes")} to="/ordenes" onClick={() => setAbierto(false)}><IconoNavegacion nombre="ordenes" />Órdenes</Link>}
          {puedeRecetas && <Link className={activo("/recetas")} to="/recetas" onClick={() => setAbierto(false)}><IconoNavegacion nombre="recetas" />Recetas</Link>}
          {puedeUsuarios && <Link className={activo("/usuarios")} to="/usuarios" onClick={() => setAbierto(false)}><IconoNavegacion nombre="usuarios" />Usuarios</Link>}
          {puedeRoles && <Link className={activo("/roles")} to="/roles" onClick={() => setAbierto(false)}><IconoNavegacion nombre="roles" />Roles y permisos</Link>}
          {puedeAuditoria && <Link className={activo("/auditoria")} to="/auditoria" onClick={() => setAbierto(false)}><IconoNavegacion nombre="auditoria" />Auditoría</Link>}
        </nav>
        {usuario && (
          <div className="nav-user">
            <p className="nav-user-name">{nombre}</p>
            {rol && <p className="nav-user-role">{rol}</p>}
            <button type="button" className="nav-logout" aria-label={`Cerrar sesión de ${nombre}`} onClick={async () => { await cerrarSesionServidor(); salir(); navigate("/login", { replace: true }); }}>Cerrar sesión</button>
          </div>
        )}
      </aside>
      <div className="layout-main">
        <main className="content"><div className="content-inner">{children ?? <Outlet />}</div></main>
      </div>
    </div>
  );
}
