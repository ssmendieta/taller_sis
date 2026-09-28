import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { iniciarSesion } from "../services/auth.js";
import "../styles/login.css";

export default function LoginPage() {
  const { usuario, ingresar } = useSesion();
  const location = useLocation();
  const navigate = useNavigate();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  if (usuario) return <Navigate to={location.state?.from || "/"} replace />;

  async function enviar(evento) {
    evento.preventDefault();
    if (cargando) return;
    setCargando(true);
    setError("");
    try {
      ingresar(await iniciarSesion(correo, password));
      navigate(location.state?.from || "/", { replace: true });
    } catch (fallo) {
      setError(fallo.message || "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <section className="login-page">
      <form className="login-panel" onSubmit={enviar}>
        <h1>Iniciar sesión</h1>
        <p>Ingresa con la cuenta asignada por el administrador.</p>
        <label>Correo electrónico
          <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required disabled={cargando} />
        </label>
        <label>Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={cargando} />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" disabled={cargando}>{cargando ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </section>
  );
}
