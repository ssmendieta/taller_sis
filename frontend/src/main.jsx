import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { SesionProvider } from "./context/SesionContext.jsx";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SesionProvider><App /></SesionProvider>
  </React.StrictMode>
);
