import { useEffect, useRef, useState } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";
import FormularioRuta from "../components/logistica/rutas/FormularioRuta.jsx";
import ParadasRuta from "../components/logistica/rutas/ParadasRuta.jsx";
import RecursosRuta from "../components/logistica/rutas/RecursosRuta.jsx";
import ListaRutas from "../components/logistica/rutas/ListaRutas.jsx";
import {
  actualizarRuta, consultarRecursosLogisticos, crearRuta, listarAgrupaciones, listarBoletasDisponibles,
  listarRutas, PERMISO_GESTIONAR_RUTAS, validarRuta,
} from "../services/logisticaService.js";
import { FORMATO_TITULO } from "../constants/marca.js";
import "../styles/recursos-logisticos.css";
import "../styles/rutas.css";

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function hoy() {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

const vacio = () => ({ grupoId: "", fecha: "", vehiculo: "", chofer: "", paradas: [] });

function mensajeError(fallo, accion) {
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  if (fallo?.status === 403) return `No tienes permiso para ${accion}. Permiso necesario: ${PERMISO_GESTIONAR_RUTAS}.`;
  if (fallo?.status === 404 && /^Cannot (POST|GET|PUT)/.test(fallo.message ?? "")) {
    return "La planificación de rutas todavía no está disponible en el servidor.";
  }
  return fallo?.message || `No se pudo ${accion}.`;
}

// ABC-372: el encargado planifica una ruta completa y, si algo falla, conserva
// todo lo que ya escribió. Elegir recursos no los reserva: el ERP los valida al guardar.
export default function RutasPage() {
  const [valores, setValores] = useState(vacio);
  const [editandoId, setEditandoId] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [boletas, setBoletas] = useState([]);
  const [cargandoBoletas, setCargandoBoletas] = useState(true);
  const [errorDatos, setErrorDatos] = useState(null);
  const [rutas, setRutas] = useState([]);
  const [cargandoRutas, setCargandoRutas] = useState(true);
  const [errorRutas, setErrorRutas] = useState(null);
  const [recursos, setRecursos] = useState(null);
  const [cargandoRecursos, setCargandoRecursos] = useState(false);
  const [errorRecursos, setErrorRecursos] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState("");
  const enCurso = useRef(false);
  const consultaRecursos = useRef(null);
  const claves = useRef(0);
  const montada = useRef(true);

  async function recargarRutas() {
    setErrorRutas(null);
    try {
      const datos = await listarRutas();
      if (montada.current) setRutas(datos);
    } catch (fallo) {
      if (montada.current) setErrorRutas(mensajeError(fallo, "cargar las rutas"));
    } finally {
      if (montada.current) setCargandoRutas(false);
    }
  }

  // Solo las boletas libres de ruta activa; al editar se suman las de esa ruta.
  async function cargarBoletas(rutaId = null) {
    setCargandoBoletas(true);
    try {
      const datos = await listarBoletasDisponibles({ rutaId });
      if (montada.current) {
        setBoletas(datos);
        setErrorDatos(null);
      }
    } catch (fallo) {
      if (montada.current) setErrorDatos(mensajeError(fallo, "cargar las boletas disponibles"));
    } finally {
      if (montada.current) setCargandoBoletas(false);
    }
  }

  useEffect(() => {
    montada.current = true;
    document.title = FORMATO_TITULO("Planificar ruta");
    recargarRutas();
    cargarBoletas();
    listarAgrupaciones()
      .then((datos) => montada.current && setGrupos(Array.isArray(datos) ? datos : []))
      .catch((fallo) => montada.current && setErrorDatos(mensajeError(fallo, "cargar los grupos")));
    return () => {
      montada.current = false;
      consultaRecursos.current?.abort();
    };
  }, []);

  // Los recursos dependen de la fecha; recargarlos nunca borra lo ya elegido.
  useEffect(() => {
    consultaRecursos.current?.abort();
    setErrorRecursos(null);
    if (!FECHA_ISO.test(valores.fecha)) {
      setRecursos(null);
      setCargandoRecursos(false);
      return undefined;
    }
    const controller = new AbortController();
    consultaRecursos.current = controller;
    setCargandoRecursos(true);
    consultarRecursosLogisticos({ fecha: valores.fecha }, { signal: controller.signal })
      .then((datos) => consultaRecursos.current === controller && setRecursos(datos))
      .catch((fallo) => {
        if (consultaRecursos.current !== controller || fallo?.name === "AbortError") return;
        setRecursos(null);
        setErrorRecursos(mensajeError(fallo, "consultar los recursos logísticos"));
      })
      .finally(() => consultaRecursos.current === controller && setCargandoRecursos(false));
    return () => controller.abort();
  }, [valores.fecha]);

  function nuevaParada(destino = "", boletaIds = []) {
    claves.current += 1;
    return { clave: `p${claves.current}`, destino, boletaIds };
  }

  function cambiar(campo, valor) {
    setError(null);
    setExito("");
    if (campo !== "grupoId") {
      setValores((actuales) => ({ ...actuales, [campo]: valor }));
      return;
    }
    // Al elegir un grupo se precargan fecha y destino sin pisar lo ya escrito.
    const grupo = grupos.find((fila) => fila.id === valor);
    setValores((actuales) => {
      if (!grupo) return { ...actuales, grupoId: valor };
      const paradas = actuales.paradas.length
        ? actuales.paradas.map((parada, indice) => (indice === 0 && !parada.destino.trim() ? { ...parada, destino: grupo.destino } : parada))
        : [nuevaParada(grupo.destino)];
      return { ...actuales, grupoId: valor, fecha: actuales.fecha || grupo.fechaRequerida, paradas };
    });
  }

  function seleccionarRecurso(tipo, idExterno) {
    cambiar(tipo, idExterno);
  }

  function editarParadas(transformar) {
    setError(null);
    setExito("");
    setValores((actuales) => ({ ...actuales, paradas: transformar(actuales.paradas) }));
  }

  const agregarParada = () => editarParadas((paradas) => [...paradas, nuevaParada()]);
  const quitarParada = (clave) => editarParadas((paradas) => paradas.filter((parada) => parada.clave !== clave));
  const cambiarDestino = (clave, destino) =>
    editarParadas((paradas) => paradas.map((parada) => (parada.clave === clave ? { ...parada, destino } : parada)));
  const alternarBoleta = (clave, boletaId) =>
    editarParadas((paradas) => paradas.map((parada) => {
      if (parada.clave !== clave) return parada;
      const boletaIds = parada.boletaIds.includes(boletaId)
        ? parada.boletaIds.filter((id) => id !== boletaId)
        : [...parada.boletaIds, boletaId];
      return { ...parada, boletaIds };
    }));

  function editar(ruta) {
    setError(null);
    setExito("");
    setEditandoId(ruta.id);
    cargarBoletas(ruta.id);
    setValores({
      grupoId: ruta.grupoId ? String(ruta.grupoId) : "",
      fecha: ruta.fechaProgramada,
      vehiculo: ruta.vehiculoExternoId,
      chofer: ruta.choferExternoId,
      paradas: [...ruta.paradas]
        .sort((a, b) => a.secuencia - b.secuencia)
        .map((parada) => nuevaParada(parada.destino, (parada.boletas ?? []).map((fila) => String(fila.boletaId)))),
    });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setValores(vacio());
    setError(null);
    cargarBoletas();
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (enCurso.current) return;
    setExito("");
    const invalido = validarRuta(valores, hoy());
    if (invalido) {
      setError({ mensaje: invalido, conflictos: [] });
      return;
    }
    enCurso.current = true;
    setEnviando(true);
    setError(null);
    try {
      const ruta = editandoId ? await actualizarRuta(editandoId, valores) : await crearRuta(valores);
      if (!montada.current) return;
      setExito(`Ruta #${ruta.id} ${editandoId ? "actualizada" : "guardada"} como ${ruta.estado.toLowerCase()}.`);
      setEditandoId(null);
      setValores(vacio());
      await Promise.all([recargarRutas(), cargarBoletas()]);
    } catch (fallo) {
      // Un error conserva todo lo escrito: solo se informa qué corregir.
      if (montada.current) {
        setError({ mensaje: mensajeError(fallo, editandoId ? "actualizar la ruta" : "guardar la ruta"), conflictos: fallo?.conflictos ?? [] });
        // Si otra ruta tomó una boleta mientras tanto, la lista se actualiza sin tocar el formulario.
        if (fallo?.status === 409) cargarBoletas(editandoId);
      }
    } finally {
      enCurso.current = false;
      if (montada.current) setEnviando(false);
    }
  }

  return (
    <section className="ts-page recursos-logisticos rutas-planificacion" aria-labelledby="rutas-titulo">
      <PageHeader
        titulo="Planificar ruta"
        descripcion="Define grupo, fecha, paradas con sus boletas, vehículo y chofer. Puedes editar la ruta mientras siga planificada."
      />

      {errorDatos && <div className="ts-feedback ts-error" role="alert">{errorDatos}</div>}

      <FormularioRuta
        valores={valores}
        grupos={grupos}
        editandoId={editandoId}
        enviando={enviando}
        error={error}
        exito={exito}
        onCambiar={cambiar}
        onSubmit={guardar}
        onCancelar={cancelarEdicion}
      >
        <ParadasRuta
          paradas={valores.paradas}
          boletas={boletas}
          cargandoBoletas={cargandoBoletas}
          onCambiarDestino={cambiarDestino}
          onAlternarBoleta={alternarBoleta}
          onAgregar={agregarParada}
          onQuitar={quitarParada}
        />
        <RecursosRuta
          fecha={valores.fecha}
          recursos={recursos}
          cargando={cargandoRecursos}
          error={errorRecursos}
          seleccion={{ vehiculo: valores.vehiculo, chofer: valores.chofer }}
          onSeleccionar={seleccionarRecurso}
        />
      </FormularioRuta>

      <ListaRutas rutas={rutas} cargando={cargandoRutas} error={errorRutas} editandoId={editandoId} onEditar={editar} />
    </section>
  );
}
