// Paleta y tipografía del vídeo. Oscuro tipo puesto de mando, un acento por
// significado. Cambiar aquí y cambia en todas las escenas.

export const C = {
  bg: "#07090f",
  bgPanel: "#0e1320",
  bgPanelSoft: "#141a2b",
  line: "#1f2740",
  text: "#e8ecf5",
  textDim: "#8a93ab",
  textFaint: "#4d5670",

  // Significado
  fire: "#ff5a1f",
  fireDeep: "#c2310a",
  cone: "#ff8f3c",
  person: "#4cc9f0", // vecino localizado
  personUnknown: "#5b6478", // aún sin contestar
  personNoAnswer: "#0b0d14", // no contesta (negro con borde rojo)
  route: "#38e07b",
  routeBad: "#ff3b3b",
  shelter: "#b48cff",
  patrol: "#ffd23f",
  human: "#ffffff",
  ok: "#38e07b",
  warn: "#ffd23f",
  danger: "#ff3b3b",

  // HappyRobot (aprox. de su UI: fondo claro, acento morado/índigo)
  hrBg: "#f7f7fb",
  hrPanel: "#ffffff",
  hrBorder: "#e4e6ef",
  hrText: "#171a26",
  hrTextDim: "#6b7186",
  hrAccent: "#5b5bd6",
  hrAccentSoft: "#eceafd",
};

export const FONT = {
  ui: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  display: "'Inter', 'Helvetica Neue', Arial, sans-serif",
};

export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const sec = (s: number) => Math.round(s * FPS);
