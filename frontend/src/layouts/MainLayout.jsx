import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "../styles/layout.css";

const TIEMPO_INACTIVIDAD = 15 * 60 * 1000;

export default function MainLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState(
    () => JSON.parse(localStorage.getItem("usuario") || "null")
  );

  const estaEnLogin = location.pathname === "/login";
  const esAdmin = usuario?.rolId === 1 || usuario?.rolId === "1";

  const isActive = (path) =>
    location.pathname === path ? "active" : "";

  const cerrarSesion = () => {
    localStorage.removeItem("usuario");
    setUsuario(null);
    navigate("/", { replace: true });
  };

  useEffect(() => {
    const actualizarUsuario = () => {
      const usuarioGuardado = localStorage.getItem("usuario");

      setUsuario(
        usuarioGuardado ? JSON.parse(usuarioGuardado) : null
      );
    };

    actualizarUsuario();
  }, [location.pathname]);

  useEffect(() => {
    if (!usuario || estaEnLogin) return;

    let temporizador;

    const reiniciarTemporizador = () => {
      clearTimeout(temporizador);

      temporizador = setTimeout(() => {
        cerrarSesion();
      }, TIEMPO_INACTIVIDAD);
    };

    const eventos = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    eventos.forEach((evento) => {
      window.addEventListener(evento, reiniciarTemporizador);
    });

    reiniciarTemporizador();

    return () => {
      clearTimeout(temporizador);

      eventos.forEach((evento) => {
        window.removeEventListener(evento, reiniciarTemporizador);
      });
    };
  }, [usuario, estaEnLogin]);

  if (estaEnLogin) {
    return <>{children}</>;
  }

  return (
    <div className="layout">
      <nav className="navbar">

        <span className="brand">Taller App</span>

        <Link className={isActive("/")} to="/">
          Inicio
        </Link>

        <Link className={isActive("/produccion")} to="/produccion">
          Producción
        </Link>

        <Link className={isActive("/logistica")} to="/logistica">
          Logística
        </Link>

        <Link className={isActive("/estado")} to="/estado">
          Estado
        </Link>

        {/* SOLO ADMIN */}
        {esAdmin && (
          <>
            <Link className={isActive("/roles")} to="/roles">
              Roles
            </Link>

            <Link className={isActive("/usuarios")} to="/usuarios">
              Usuarios
            </Link>
          </>
        )}

        <Link className={isActive("/ordenes")} to="/ordenes">
          Órdenes
        </Link>

        {/* SESIÓN */}
        {usuario ? (
          <button
            type="button"
            onClick={cerrarSesion}
            className="btn-logout"
          >
            Cerrar sesión
          </button>
        ) : (
          <Link className={isActive("/login")} to="/login">
            Iniciar sesión
          </Link>
        )}

      </nav>

      <main className="content">
        {children}
      </main>
    </div>
  );
}