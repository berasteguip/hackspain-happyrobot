/**
 * Puntos del mapa preparados para que un guion de demo los pulse.
 *
 * El mapa se pinta entero como capas WebGL dentro de un único `<canvas>`: no hay
 * un nodo por marcador, así que no existe selector posible y los clics se
 * resuelven por coordenadas (`queryRenderedFeatures`). Los puntos declarados aquí
 * reciben, además del símbolo que ya pinta el canvas, un marcador DOM real encima
 * con `data-demo` y `data-demo-id`, que sí es pulsable por un guion grabado.
 *
 * Se marcan siempre los sitios fijos del escenario activo, que son pocos: los
 * puntos de encuentro (`meeting-point`) y los centros de respuesta
 * (`center-marker`). Son ~6 nodos.
 *
 * Las ~300 personas NO se marcan en bloque: serían 300 nodos a los que Mapbox
 * reescribe la posición en cada frame de paneo y zoom, sobre una página que ya va
 * justa. Para llegar a cualquiera de ellas está el panel lateral, que tiene
 * selector propio (`[data-demo="person"][data-demo-id="…"]`) y hace volar el mapa
 * hasta la persona. La que esté seleccionada recibe marcador automáticamente.
 *
 * Aquí solo van los vecinos concretos que el guion necesite pulsar directamente
 * sobre el mapa, por id. Mantener la lista corta.
 *
 * La guía de onboarding añade dos anclas más (`tour-fire`, `tour-people`) desde
 * CommandMap, sobre el foco y un vecino representativo; no hace falta listarlas aquí.
 */
export const DEMO_PEOPLE: string[] = [
  // 'c-01',
]
