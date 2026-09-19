// EL GUION ES DATOS. Aquí viven las escenas, su duración y las líneas de voz
// con su offset dentro de la escena. Cambiar el ritmo del vídeo = editar esto.
//
// Dos voces:
//   agent  -> lo que oye el vecino por teléfono (ElevenLabs, filtro teléfono)
//   system -> nos habla a nosotros, narra lo que pasa por detrás (limpia)
//   neighbor -> el vecino (otra voz, sale como transcripción en pantalla)
//
// Cuando estén los .mp3 de ElevenLabs: uno por línea, en public/audio/<id>.mp3,
// y el componente Narration los pone en su offset. Hasta entonces, subtítulos.

export type Voice = "agent" | "system" | "neighbor";

export type Line = {
  id: string;
  voice: Voice;
  at: number; // segundos desde el inicio de la escena
  text: string;
};

export type SceneDef = {
  id: string;
  title: string;
  seconds: number;
  lines: Line[];
};

export const SCENES: SceneDef[] = [
  {
    id: "cold-open",
    title: "Frío: el pueblo, el fuego, el problema",
    seconds: 9,
    lines: [
      {
        id: "s1-a",
        voice: "system",
        at: 1.0,
        text: "Sierra de la Culebra. Un incendio avanza hacia tres pueblos.",
      },
      {
        id: "s1-b",
        voice: "system",
        at: 4.5,
        text: "El puesto de mando ve el fuego. Pero no ve a la gente.",
      },
    ],
  },
  {
    id: "the-call",
    title: "Suena un móvil en Losacio",
    seconds: 10,
    lines: [
      {
        id: "s2-a",
        voice: "agent",
        at: 2.0,
        text: "Le llamo de Protección Civil de Zamora. Soy un sistema automático de inteligencia artificial. Hay un incendio acercándose a Losacio y tiene que salir de casa.",
      },
    ],
  },
  {
    id: "scale",
    title: "No es una llamada: son 300",
    seconds: 12,
    lines: [
      {
        id: "s3-a",
        voice: "system",
        at: 0.5,
        text: "Esta no es una llamada. Son trescientas, a la vez, a cada casa del pueblo.",
      },
      { id: "s3-b", voice: "system", at: 7.5, text: "Vamos a seguir una." },
    ],
  },
  {
    id: "one-house",
    title: "Una casa: quién está, cómo se mueve",
    seconds: 18,
    lines: [
      { id: "s4-a", voice: "agent", at: 0.5, text: "¿Cuántas personas hay en la casa?" },
      { id: "s4-b", voice: "neighbor", at: 3.0, text: "Tres. Yo, mi madre, que tiene noventa y uno, y mi nieto." },
      {
        id: "s4-c",
        voice: "system",
        at: 6.5,
        text: "Tres personas. Una de noventa y uno. El grupo irá a la velocidad de la más lenta: dos kilómetros y medio por hora.",
      },
      { id: "s4-d", voice: "system", at: 13.0, text: "Eso cambia todo lo que viene después." },
    ],
  },
  {
    id: "route",
    title: "Ubicación, cuatro puntos, la ruta segura",
    seconds: 20,
    lines: [
      { id: "s5-a", voice: "agent", at: 0.5, text: "Le mando un enlace. Lo abre y ya sabemos dónde está." },
      {
        id: "s5-b",
        voice: "system",
        at: 5.0,
        text: "Con su posición: cuatro puntos de encuentro. El más cercano, a un kilómetro y medio.",
      },
      {
        id: "s5-c",
        voice: "system",
        at: 10.0,
        text: "Pero la ruta cruza el frente en veinte minutos. Descartada. Por tiempo, y esquivando el fuego, el suyo es Tábara.",
      },
      {
        id: "s5-d",
        voice: "agent",
        at: 16.0,
        text: "Salgan por la carretera de Tábara. Antonio pasa a recogerlos en ocho minutos con un Seat León blanco.",
      },
    ],
  },
  {
    id: "village",
    title: "El pueblo entero se mueve. Gira el viento",
    seconds: 18,
    lines: [
      {
        id: "s6-a",
        voice: "system",
        at: 0.5,
        text: "Doscientas dieciséis personas en movimiento. Cada una con su ruta y su hora de llegada.",
      },
      {
        id: "s6-b",
        voice: "system",
        at: 7.0,
        text: "Gira el viento. El plan de hace veinte minutos ya no vale.",
      },
      {
        id: "s6-c",
        voice: "system",
        at: 11.5,
        text: "Doce rutas se rehacen. Doce vecinos reciben una llamada de veinte segundos.",
      },
    ],
  },
  {
    id: "no-answer",
    title: "Los que no cogen el teléfono",
    seconds: 18,
    lines: [
      { id: "s7-a", voice: "system", at: 0.5, text: "Tres casas no contestan." },
      {
        id: "s7-b",
        voice: "system",
        at: 3.5,
        text: "La Guardia Civil no recibe «barran el pueblo». Recibe tres direcciones, en orden, y a cuál no ir porque el fuego llega antes.",
      },
      {
        id: "s7-c",
        voice: "system",
        at: 11.0,
        text: "El helicóptero va al sector con más gente dentro. Y antes de que salga nada, una persona lo aprueba.",
      },
    ],
  },
  {
    id: "close",
    title: "Cierre",
    seconds: 10,
    lines: [
      {
        id: "s8-a",
        voice: "system",
        at: 0.5,
        text: "Con estos datos, las doscientas dieciséis personas llegan al refugio antes que el frente.",
      },
      { id: "s8-b", voice: "system", at: 6.0, text: "Sabemos dónde está cada persona. Y la sacamos." },
    ],
  },
];

export const TOTAL_SECONDS = SCENES.reduce((a, s) => a + s.seconds, 0);

export const sceneStart = (id: string) => {
  let t = 0;
  for (const s of SCENES) {
    if (s.id === id) return t;
    t += s.seconds;
  }
  throw new Error(`scene ${id} not found`);
};
