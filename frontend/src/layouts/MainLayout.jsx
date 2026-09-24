import { Link, useLocation } from "react-router-dom";
import "../styles/layout.css";


export default function MainLayout({ children }) {


  const location = useLocation();


  const usuario = JSON.parse(
    localStorage.getItem("usuario")
  );


  const rol = usuario?.rol || null;



  const isActive = (path) =>
    location.pathname === path ? "active" : "";



  return (

    <div className="layout">


      <nav className="navbar">


        <span className="brand">
          Taller App
        </span>


        <Link 
          className={isActive("/")}
          to="/"
        >
          Inicio
        </Link>



        <Link 
          className={isActive("/login")}
          to="/login"
        >
          Login
        </Link>



        {(rol === "ADMIN" || rol === "OPERADOR") && (

          <Link
            className={isActive("/produccion")}
            to="/produccion"
          >
            Producción
          </Link>

        )}



        {(rol === "ADMIN" || rol === "LOGISTICA") && (

          <Link
            className={isActive("/logistica")}
            to="/logistica"
          >
            Logística
          </Link>

        )}



        {rol === "ADMIN" && (

          <>

          <Link
            className={isActive("/recetas")}
            to="/recetas"
          >
            Recetas
          </Link>


          <Link
            className={isActive("/estado")}
            to="/estado"
          >
            Estado
          </Link>

          </>

        )}



      </nav>


      <main className="content">
        {children}
      </main>


    </div>

  );

}