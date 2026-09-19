# Gestion de imprevistos: que puede hacer el agente cuando el plan se rompe

Lo que nos piden es gestion, no un plan estatico. La idea base: cada imprevisto es lo mismo por debajo.

1. Entra un evento (viento, carretera cortada, refugio lleno, persona que no se mueve).
2. El motor recalcula el plan y saca el diff: quien tenia ruta, refugio o convoy que ya no vale.
3. HappyRobot recontacta solo a los afectados, ordenados por minutos hasta el frente.

Si montamos ese mecanismo una vez, cada imprevisto nuevo es solo un tipo de evento mas.

## Ideas por quien provoca el cambio

### El fuego o el entorno cambia
1. **Viento gira** y el frente salta la carretera que usaban 40 personas. Rellamada con ruta nueva. Matiz por GPS: al que ya paso el tramo se le dice "sigue", al que no llego "da la vuelta".
2. **Refugio amenazado.** Evacuacion de segundo nivel: los que estan dentro y los que van en camino se reasignan a otro refugio. El mapa muestra la capacidad liberandose.
3. **Humo cierra una pista a pie.** Cambiar el modo de ese grupo: de "a pie por el camino" a "sube al coche de X".

### La carretera o el plan se rompe
4. **Incidente reportado por los vecinos.** Alguien dice en la conversacion "hay un coche cruzado en la N-631". Extract lo saca como incidente con tramo, el motor corta esa arista del grafo y recalcula a todos los que pasaban por ahi. Crowdsourcing del estado de la red desde las llamadas, sin sensores. Muy demostrable.
5. **Refugio se llena antes de lo previsto** (llega gente no registrada). Los que iban con reserva se reasignan al siguiente por tiempo de llegada.
6. **Convoy roto.** El coche guia avanza y uno se queda atras (GPS). Llamada al rezagado: lo engancha el siguiente convoy o se le da ruta propia.
7. **Averia o sin gasolina.** "Antonio pasa por tu puerta en 4 minutos, sal a la carretera con la abuela".

### La persona hace algo distinto a lo que dijo
8. **GPS parado 10 minutos sin llegar.** Llamada de comprobacion. Si no contesta, pasa a la lista de la patrulla con ultima posicion conocida.
9. **Va hacia el lado equivocado** (hacia el fuego o a un refugio que no es el suyo). Llamada inmediata de correccion.
10. **Cambia de opinion.** Dijo que se iba y sigue en casa a los 15 min, o dijo que se quedaba y aparece en carretera. Recalcular e insistir con dato duro: "el frente llega a tu calle en 25 minutos".
11. **Pierde cobertura.** Deja de responder. Fallback a SMS, se asume ultima posicion y se avisa al convoy mas cercano.
12. **Check-in de llegada.** "Responde LLEGUE" al entrar en el refugio. Cierra el loop y da la lista viva de quien falta por sector, que es lo que la patrulla necesita.

### La autoridad cambia la orden
13. **Confinamiento en vez de evacuacion** para un pueblo (el fuego cerro todas las salidas). La instruccion cambia para todo el pueblo de golpe; a los que ya estan en carretera se les redirige o se les mete en el pueblo vecino.
14. **Emergencia medica en mitad de la evacuacion** (alguien llama al numero inbound). Transfer a humano, marcar posicion, prioridad para la ambulancia. Aqui vive el criterio "Control" del reto.
15. **Operador inyecta un evento a mano** desde el dashboard ("corto la carretera X", "el frente salta aqui") y ve la cascada: N afectados, cola de rellamadas propuesta, boton Aprobar con cuenta atras. El humano gestiona, el agente ejecuta.

## Como montarlo en HappyRobot (una sola vez)

Nuestra API detecta el evento, calcula afectados y dispara un workflow "recontactar" por webhook con `persona_id` + tipo de evento + instruccion nueva. Dentro: Loop sobre afectados, Generate redacta el mensaje en el tono de la conversacion anterior (ya conoce a la persona), Send SMS o llamada de voz, Extract saca la confirmacion. Todo lo de arriba son plantillas distintas del mismo workflow.

## Propuesta para la demo

Cuatro que se ven en el mapa y se disparan con un boton del dashboard:

| Caso | Cubre |
|---|---|
| 1. Viento gira | Entorno |
| 4. Vecino reporta carretera cortada | Red |
| 6. Convoy roto | Persona |
| 12. Check-in de llegada | Cierre del loop |
