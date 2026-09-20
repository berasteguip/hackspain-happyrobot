1. Sistema agéntico: Decide y actúa por su cuenta.
El agente, durante la llamada, es capaz de decidir cuándo pedir la ubicación, cuándo llamar a cuerpos del estado para obtener información y cuándo llamar a un tercero que puede necesitar ayuda. También es proactivo en la llamada, eligiendo qué zonas se consideran de alto peligro para estar listo para ejecutarse en instancias paralelas para todos los habitantes que necesiten la asistencia. También es capaz de leer cuando considera una base de datos actualizada en real time y escribir sobre ella para aportar conocimiento a los otros agentes. 

2. Escenario que se mueve: La situación cambia mientras el sistema corre. Si el caso es fijo, no hay nada que adaptar.
El agente se entera de lo que pasa porque es capaz de llamar a fuentes externas y fiables y también lee frecuentemente de una base de datos que se actualiza a tiempo real. Sabe priorizar porque tiene un flujo definido de las cosas, de las preguntas más importantes que tiene que hacer y, en casos urgentes y tal, cuelga sin alargar la llamada para que la persona esté segura.

Ante todo, coordina la respuesta porque, nada más acabar la llamada, las observaciones del cliente se transfieren a todo el sistema. La aplicación es consciente de esos cambios y se pueden apreciar. Desde el panel de control, la persona responsable de la gestión del incendio es capaz de hacer seguimiento de cada uno de ellos. Es decir, se les facilita la coordinación y se adapta, porque también, por el hecho de tener una base de datos en tiempo real, muchas veces encuentra datos o incidencias contrarios al plan que tenía. Es capaz de adaptarse. Obtiene la ubicación en tiempo real del usuario, le calcula una ruta óptima y es capaz de actualizar información del usuario cuando hay cosas inoportunas, como un fuego que se mueve por el viento y tal. Es capaz de recalcular rutas y redirigir a toda la población. 

3. Respuesta de varios pasos: Una cadena de acciones con un objetivo, no una acción suelta.
- Operador
Define parámetros y selecciona el agente.
Define el polígono y los aforos.
Verifica las sugerencias generadas.
El prompt deja de ser un fichero y pasa a generarse desde la UI.
- Orquestación
Recibe la configuración y el polígono del operador.
Intersecta la información con el censo.
Ordena los casos por prioridad.
Lanza N agentes.
- Agentes × N
Reciben una cola priorizada.
Realizan llamadas de voz.
Envían un enlace de ubicación.
Generan un JSON por persona.
Devuelven coordenadas y nivel de confianza.
- Capa geo
Recibe coordenadas y confianza.
Calcula rutas alternativas.
Filtra las rutas contra el polígono de peligro.
Busca refugios que queden fuera de la zona afectada.
Si existe una ruta segura, devuelve ruta y ETA.
Si no existe una ruta segura:
Activa rescate físico prioritario.
Escala el caso a bomberos.
No emite ninguna ruta.
- Estado / mapa
Mantiene el estado global del sistema.
Registra confianza por punto.
Mantiene auditoría por agente.
Repinta el mapa y genera sugerencias.
- Bucle de detección de peligro
El sistema detecta una nueva zona de peligro.
Genera una sugerencia en el mapa.
El operador verifica la sugerencia con un clic.
El flujo vuelve al operador para actualizar parámetros, polígono o aforos.
- Bucle de vecino reportado
Si un vecino es reportado, se genera una nueva llamada.
El caso recibe prioridad alta.
Vuelve a entrar en la orquestación para su procesamiento prioritario.
- Bucle de avance del frente
Cuando el frente avanza, el sistema revalida las rutas activas.
Identifica qué personas han quedado afectadas por el cambio.
Solo vuelve a llamar a esas personas.
Los casos afectados regresan a la orquestación.

4. Interacción de verdad: Llama, escribe, crea tickets o mueve datos en un sistema real. Hablar con una persona cuenta.
Llama a personas reales, está conectado a datos reales, mueve datos que puedes ver en una interfaz y se comunica no solo con una, sino con múltiples personas en paralelo, gestionando turnos y comunicaciones cruzadas. Nuestro sistema incide mucho en la exploración, permitiendo que el agente realice múltiples turnos seguidos en los que mapea a las personas. Porque existen muchas formas de medir, por ejemplo, el fuego o fenómenos naturales en estas crisis, pero no es tan fácil medir cómo se van a mover y cómo se van a desarrollar en el tiempo los flujos y movimientos humanos.

Entonces, nuestro sistema es ya por sí solo una fuente de datos riquísima y una fuente de inteligencia muy valiosa para cualquier institución que tenga que actuar a priori o a posteriori sobre estas situaciones. El agente explora. El agente quiere tener una visión 360 traqueada de la situación. La tiene a nivel de fuego porque hay datos precisos de sensórica que mantienen actualizada la realidad de la catástrofe, pero de personas no hay. Entonces realiza llamadas que se pueden encadenar para tener esa fase de exploración de la forma más precisa y actualizada en tiempo real. 

5. Hemos centralizado todas las fuentes de conocimiento para las personas que tienen que gestionar las crisis, de tal manera que ya no tienes solo a los cuerpos que toman acción mapeados en tu sistema, sino también a las personas vulnerables y sobre las que tienes que actuar con movimientos en directo. De esta manera, es mucho más fácil coordinar a la gente que ayuda y a la gente que se tiene que socorrer y tomar acción. Es mucho más fácil cuando tienes los datos enfrente. La interfaz facilita que, ante situaciones de crisis donde las decisiones son tan críticas y hay vidas en juego, el humano responsable tenga todos los datos encima de la mesa para poder tomar la decisión con más criterio. 

6. Hemos generado un sistema de evaluación y retroalimentación de la experiencia recabada a través de diferentes simulaciones de la gente. Tenemos dos piezas fundamentales:
- Una generación de escenarios en tiempo real con eventos que cambian la situación de la catástrofe.
- Un dataset de ground truth que representa la política óptima que tiene que seguir la gente para desenvolverse bien en esa situación.
Presentamos a nuestro agente en la experiencia de la situación o la realidad de la situación frente a los cambios y medimos cómo actúa. Un juez compara la actuación frente al ground truth que hemos diseñado nosotros a mano.
Entonces, hay un sistema que crea los escenarios con la idea o con la política óptima de resolución. Enfrentamos a nuestro agente a ese escenario y hay un juez, un cert party, que mide cómo el agente ha performado. Aparte de medir, da feedback de cómo se podría mejorar el agente para que, en próximas partidas, no se portara de esa forma.

