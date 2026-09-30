import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { iniciarSesion } from "../services/auth.js";
import "../styles/LoginPage.css";

// El diseño visual (tarjeta, mostrar/ocultar contraseña, pie) es el aportado
// por RamaTats (ABC-133). La sesión es la de develop+Andrea (ABC-176):
// iniciarSesion() devuelve { accessToken, usuario } y SesionContext lo guarda
// en sessionStorage con expiración por inactividad y por JWT (sesion.js).
export default function LoginPage() {
  const { usuario, ingresar } = useSesion();
  const location = useLocation();
  const navigate = useNavigate();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  if (usuario) return <Navigate to={location.state?.from || "/"} replace />;

  const avisoExpirada = location.state?.sesionExpirada
    ? "Tu sesión expiró por inactividad o vencimiento. Vuelve a ingresar; te llevaremos a tu pantalla anterior."
    : "";

  async function manejarSubmit(evento) {
    evento.preventDefault();
    if (cargando) return;
    setError("");

    if (!correo.trim()) {
      setError("Ingresa tu correo electrónico.");
      return;
    }
    if (!password.trim()) {
      setError("Ingresa tu contraseña.");
      return;
    }

    setCargando(true);
    try {
      ingresar(await iniciarSesion(correo, password));
      navigate(location.state?.from || "/", { replace: true });
    } catch (fallo) {
      setError(fallo.message || "No se pudo iniciar sesión. Inténtalo nuevamente.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="login-header">
          <div className="login-icon"></div>
          <h1>Iniciar sesión</h1>
          <p>Ingresa tus credenciales para acceder al sistema.</p>
        </div>

        <form onSubmit={manejarSubmit} className="login-form" noValidate>
          {avisoExpirada && <p role="status" className="login-error">{avisoExpirada}</p>}
          <div className="login-form-group">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              type="email"
              placeholder="ejemplo@correo.com"
              autoComplete="username"
              autoFocus
              value={correo}
              disabled={cargando}
              onChange={(e) => {
                setCorreo(e.target.value);
                setError("");
              }}
            />
          </div>

          <div className="login-form-group">
            <label htmlFor="password">Contraseña</label>
            <div className="password-container">
              <input
                id="password"
                type={mostrarPassword ? "text" : "password"}
                placeholder="Ingresa tu contraseña"
                autoComplete="current-password"
                value={password}
                disabled={cargando}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
              />
              <button
                type="button"
                className="btn-mostrar-password"
                onClick={() => setMostrarPassword(!mostrarPassword)}
              >
                {mostrarPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <p>{error}</p>
            </div>
          )}

          <button type="submit" className="btn-login" disabled={cargando}>
            {cargando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <div className="login-footer">
          <p>Acceso exclusivo para usuarios registrados.</p>
        </div>

      </div>
    </div>
  );
}
