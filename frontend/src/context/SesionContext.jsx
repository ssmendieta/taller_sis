import { createContext, useContext, useEffect, useState } from "react";
import {
  actualizarUsuarioSesion,
  cerrarSesion,
  guardarSesion,
  obtenerSesion,
  registrarActividad,
} from "../services/sesion.js";
import { obtenerSesionActualServidor } from "../services/auth.js";

const SesionContext = createContext(null);

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(() => obtenerSesion());

  useEffect(() => {
    const comprobar = () => setUsuario(obtenerSesion());
    const sincronizarPermisos = async () => {
      const sesionLocal = obtenerSesion();
      if (!sesionLocal) {
        setUsuario(null);
        return;
      }
      try {
        const sesionServidor = await obtenerSesionActualServidor();
        setUsuario(actualizarUsuarioSesion(sesionServidor));
      } catch {
        setUsuario(obtenerSesion());
      }
    };
    const actividad = () => {
      if (!registrarActividad()) setUsuario(null);
    };
    const eventos = ["pointerdown", "keydown", "scroll", "touchstart"];
    eventos.forEach((evento) => window.addEventListener(evento, actividad, { passive: true }));
    const temporizador = window.setInterval(comprobar, 5000);
    window.addEventListener("focus", sincronizarPermisos);
    void sincronizarPermisos();
    return () => {
      eventos.forEach((evento) => window.removeEventListener(evento, actividad));
      window.removeEventListener("focus", sincronizarPermisos);
      window.clearInterval(temporizador);
    };
  }, []);

  function ingresar(respuesta) {
    setUsuario(guardarSesion(respuesta));
  }

  function salir() {
    cerrarSesion();
    setUsuario(null);
  }

  return <SesionContext.Provider value={{ usuario, ingresar, salir }}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const contexto = useContext(SesionContext);
  if (!contexto) throw new Error("SesionProvider no está disponible");
  return contexto;
}
