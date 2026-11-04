Preparación para futura integración con ERP de Inventarios



Objetivo



Durante el Sprint 1 se utilizará una estructura interna para simular la disponibilidad de los materiales necesarios para una orden de producción. En esta etapa no se realizará ninguna conexión real con el sistema ERP de Inventarios.



La idea es que esta estructura pueda ser reemplazada posteriormente por una integración mediante una API REST, sin tener que modificar toda la lógica del módulo de Producción.



Punto de integración



La consulta de disponibilidad se realizará después de calcular los materiales necesarios para una orden de producción. Primero se obtendrán los materiales requeridos y posteriormente se compararán con las cantidades disponibles.



El flujo actual será:



Orden de producción → Cálculo de materiales → Disponibilidad simulada → Comparación → Resultado de disponibilidad.



En una futura implementación, la disponibilidad simulada será reemplazada por una consulta al ERP de Inventarios:



Orden de producción → Cálculo de materiales → Servicio de Producción → API del ERP → Disponibilidad real → Comparación.



Información que se necesitará del ERP



Para realizar la consulta de disponibilidad, posteriormente será necesario obtener información como el código del material, nombre, unidad de medida, cantidad disponible y fecha de consulta.



Por ejemplo, una respuesta del sistema de Inventarios podría contener:



{

"materialCodigo": "MAT-001",

"materialNombre": "Harina",

"unidadMedida": "kg",

"cantidadDisponible": 80

}



Información enviada desde Producción



Producción deberá enviar los materiales que fueron calculados para la orden y las cantidades necesarias.



Por ejemplo:



{

"ordenId": 15,

"materiales": \[

{

"materialCodigo": "MAT-001",

"cantidadRequerida": 100

}

]

}



Comparación de disponibilidad



La comparación se realizará en el módulo de Producción.



Si la cantidad disponible es mayor o igual a la cantidad requerida, el material se considerará suficiente.



Si existe una cantidad disponible, pero esta es menor a la cantidad requerida, el material se considerará insuficiente.



Si la cantidad disponible es cero, el material se considerará faltante.



Solicitud de materia prima



Cuando se detecte que un material es insuficiente o faltante, posteriormente se podrá generar una solicitud de materia prima para el sistema de Inventarios.



La solicitud deberá contener la materia prima, cantidad requerida, fecha necesaria y la orden de producción de la cual proviene.



Ejemplo:



{

"ordenId": 15,

"materialCodigo": "MAT-001",

"cantidadSolicitada": 20,

"fechaNecesaria": "2026-09-30"

}



Durante el Sprint 1 esta solicitud será solamente simulada y no se enviará a ningún sistema externo.



Integración futura



Para facilitar la integración posteriormente, la consulta de disponibilidad deberá mantenerse separada de la lógica principal de Producción. De esta manera, la estructura simulada podrá cambiarse por un cliente que realice las llamadas al ERP.



Los posibles puntos de conexión serían:



GET /api/inventarios/materiales/{codigo}/disponibilidad



POST /api/inventarios/materiales/disponibilidad



POST /api/inventarios/solicitudes-materia-prima



Estos endpoints corresponden a una propuesta para la integración futura y no serán consumidos durante el Sprint 1.



Configuración futura



La dirección del sistema ERP deberá configurarse mediante variables de entorno para evitar colocar directamente la dirección dentro del código.



Por ejemplo:



ERP\_INVENTARIOS\_URL=http://erp-inventarios/api

ERP\_INVENTARIOS\_TIMEOUT=5000



En una futura integración también se podrán agregar las configuraciones necesarias para autenticación y acceso al sistema externo.



Conclusión



Para este Sprint se utilizará una simulación interna de la disponibilidad de materiales. Esta permitirá probar la consulta, comparación e identificación de materiales suficientes, insuficientes o faltantes.



La estructura queda preparada para que posteriormente la simulación pueda ser reemplazada por una integración mediante API REST con el sistema ERP de Inventarios, sin afectar la lógica principal del módulo de Producción.



