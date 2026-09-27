import { Navigate } from "react-router-dom";


export default function ProtectedRoute({ children, roles }) {

  const usuario = JSON.parse(
    localStorage.getItem("usuario")
  );


  if (!usuario) {
    return <Navigate to="/login" />;
  }


  if (roles && !roles.includes(usuario.rol)) {

    return (
      <div style={{ padding: "30px" }}>
        <h2>Acceso denegado</h2>
        <p>No tienes permisos para acceder a esta sección.</p>
      </div>
    );

  }


  return children;

}