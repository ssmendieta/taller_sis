import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import Logo from "../components/Logo.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";
import { iniciarSesion } from "../services/auth.js";
import "../styles/LoginPage.css";

export default function LoginPage() {
  const { usuario, ingresar } = useSesion();
  const location = useLocation();
  const navigate = useNavigate();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => { document.title = FORMATO_TITULO("Iniciar sesión"); }, []);

  const avisoExpirada = location.state?.sesionExpirada
    ? "Sesión expirada. Vuelve a ingresar."
    : "";

  async function manejarSubmit(evento) {
    evento.preventDefault();
    if (cargando) return;
    setError("");

    if (!correo.trim()) {
      setError("Ingresa tu correo electrónico para continuar.");
      return;
    }
    if (!password) {
      setError("Ingresa tu contraseña para continuar.");
      return;
    }

    setCargando(true);
    try {
      ingresar(await iniciarSesion(correo, password));
      navigate(location.state?.from || "/", { replace: true });
    } catch (fallo) {
      setError(fallo.message || "No se pudo iniciar sesión. Revisa tu correo y contraseña e inténtalo nuevamente.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand"><Logo /></div>
        <div className="login-header">
          <h1>Iniciar sesión</h1>
        </div>

        <form onSubmit={manejarSubmit} className="login-form" noValidate>
          {avisoExpirada && <p role="status" className="login-notice">{avisoExpirada}</p>}
          <div className="login-form-group">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              name="correo"
              type="email"
              placeholder="ejemplo@correo.com"
              autoComplete="username"
              autoFocus
              required
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
                name="password"
                type={mostrarPassword ? "text" : "password"}
                placeholder="Ingresa tu contraseña"
                autoComplete="current-password"
                required
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
                aria-pressed={mostrarPassword}
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

          <button type="submit" className="ts-btn ts-btn-primary ts-btn--login" disabled={cargando}>
            {cargando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
