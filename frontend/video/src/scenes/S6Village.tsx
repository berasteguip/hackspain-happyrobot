import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import scene from "../data/scene.json";
import { Background } from "../components/Background";
import { CrisisMap, SyntheticBadge, type HouseState } from "../components/CrisisMap";
import { DecisionLog, Stat } from "../components/HappyRobotUI";
import { Narration } from "../components/Narration";
import { curvedRoute, pointAlong, routeCrossesCone, seeded, type Pt } from "../lib/geometry";
import { C, FONT } from "../lib/theme";
import type { SceneDef } from "../script";

// Escena 6. Todas las casas que contestaron avanzan por su ruta hacia el
// refugio asignado (el que llega antes sin cruzar el cono). Barras de ocupación
// llenándose. A los 7 s gira el viento: el cono rota, las rutas que ahora lo
// cruzan pasan a rojo y se redibujan hacia el otro refugio. Log de decisiones
// escribiéndose a la derecha.

type Plan = { houseId: string; shelterId: string; pts: Pt[]; speed: number; startAt: number };

export const Village: React.FC<{ def: SceneDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const fc = scene.fire.center;
  const coneR = 720;

  const windShiftAt = 7.0;
  const bearing0 = scene.fire.headBearingDeg;
  const bearing1 = bearing0 + 24; // gira hacia el noreste: la carretera de Tábara queda bajo el cono
  const bearing = interpolate(t, [windShiftAt, windShiftAt + 2.5], [bearing0, bearing1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const plans = React.useMemo(() => {
    const rnd = seeded(11);
    const build = (bearingDeg: number, prev?: Plan[]) =>
      scene.houses
        .filter((h) => h.answers)
        .map((h, i) => {
          const options = scene.shelters.map((s, si) => {
            const pts = curvedRoute(h, s, 0.15, si % 2 === 0 ? 1 : -1);
            return { s, pts, crosses: routeCrossesCone(pts, fc, bearingDeg, scene.fire.coneHalfAngleDeg, coneR) };
          });
          const ok = options.filter((o) => !o.crosses);
          const pick = (ok.length ? ok : options).sort((a, b) => a.pts.length - b.pts.length)[0];
          const speed = 0.55 + rnd() * 0.5; // fracción de ruta por cada 10 s
          return { houseId: h.id, shelterId: pick.s.id, pts: pick.pts, speed, startAt: prev ? windShiftAt + 1.5 : 0.3 + rnd() * 2.5 };
        });
    const before = build(bearing0);
    let after = build(bearing1, before);
    // Si la geometría del cono no llega a tocar rutas, forzamos la reasignación
    // de las 12 casas más cercanas al frente que iban a Tábara: es el caso que
    // el vídeo cuenta (el plan de hace 20 min ya no vale).
    let changed = after.filter((a, i) => a.shelterId !== before[i].shelterId).length;
    if (changed < 12) {
      const tabara = scene.shelters[0];
      const other = scene.shelters[1];
      const idx = before
        .map((p, i) => ({ i, d: Math.hypot(scene.houses.find((h) => h.id === p.houseId)!.x - fc.x, scene.houses.find((h) => h.id === p.houseId)!.y - fc.y) }))
        .filter(({ i }) => before[i].shelterId === tabara.id)
        .sort((a, b) => a.d - b.d)
        .slice(0, 12)
        .map(({ i }) => i);
      after = after.map((a, i) => {
        if (!idx.includes(i)) return a;
        const h = scene.houses.find((x) => x.id === a.houseId)!;
        return { ...a, shelterId: other.id, pts: curvedRoute(h, other, 0.15, -1), startAt: windShiftAt + 1.5 };
      });
    }
    return { before, after };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shifted = t >= windShiftAt + 1.5;
  const rerouted = new Set(plans.after.filter((a, i) => a.shelterId !== plans.before[i].shelterId).map((a) => a.houseId));

  const positions: Record<string, Pt> = {};
  const houseStates: Record<string, HouseState> = {};
  const routes: Record<string, { pts: Pt[]; color: string; progress: number; dashed?: boolean; width?: number }> = {};
  const fill: Record<string, number> = {};
  let moving = 0;
  let safe = 0;

  scene.houses.forEach((h) => {
    if (!h.answers) {
      houseStates[h.id] = "no-answer";
      return;
    }
  });

  plans.before.forEach((p, i) => {
    const a = plans.after[i];
    const useAfter = shifted && rerouted.has(p.houseId);
    const plan = useAfter ? a : p;
    // progreso: velocidad * tiempo desde salida; tras el giro, los rerutados reinician desde su posición
    let prog = Math.max(0, (t - p.startAt) * (p.speed / 10));
    if (useAfter) prog = Math.max(0, (t - a.startAt) * (a.speed / 10)) + 0.15;
    prog = Math.min(1, prog);
    positions[p.houseId] = pointAlong(plan.pts, prog);
    houseStates[p.houseId] = prog >= 1 ? "safe" : prog > 0 ? "moving" : "answered";
    if (prog >= 1) safe++;
    else if (prog > 0) moving++;
    const sh = scene.shelters.find((s) => s.id === plan.shelterId)!;
    fill[sh.id] = (fill[sh.id] ?? 0) + (scene.houses.find((x) => x.id === p.houseId)?.residents ?? 1) / sh.capacity;

    // Dibujamos solo una muestra de rutas para no saturar; todas las rerutadas
    const draw = i % 4 === 0 || rerouted.has(p.houseId);
    if (!draw) return;
    if (shifted && rerouted.has(p.houseId)) {
      routes[`${p.houseId}-old`] = { pts: p.pts, color: C.routeBad, progress: 1, dashed: true, width: 2 };
      routes[p.houseId] = { pts: a.pts, color: C.route, progress: interpolate(t, [a.startAt, a.startAt + 1.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), width: 3 };
    } else if (t >= windShiftAt && rerouted.has(p.houseId)) {
      routes[p.houseId] = { pts: p.pts, color: C.routeBad, progress: 1, width: 3 };
    } else {
      routes[p.houseId] = { pts: p.pts, color: `${C.route}88`, progress: 1, width: 1.5 };
    }
  });

  const log = [
    { t: "17:02", text: "216 personas · 89 casas con instrucción · 2 refugios abiertos" },
    { t: "17:04", text: "Tábara al 62 % · redirigiendo Sesnández norte a Alcañices", color: C.warn },
    { t: "17:06", text: `VIENTO 229° → 203° · cono recalculado`, color: C.fire },
    { t: "17:06", text: `${rerouted.size} rutas cruzan el frente en <20 min · REASIGNAR`, color: C.routeBad },
    { t: "17:07", text: `${rerouted.size} rellamadas de 20 s lanzadas · 9 confirmadas`, color: C.route },
    { t: "17:09", text: "Convoy 3 (coche guía Antonio) en ruta · ETA 11 min" },
  ];
  const logVisible = Math.floor(interpolate(t, [0.8, 3.5, 7.2, 8.2, 11.5, 14.5], [1, 2, 3, 4, 5, 6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  const cam = { x: 1060, y: 470, zoom: interpolate(t, [0, 3], [1.05, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) };

  return (
    <Background>
      <CrisisMap camera={cam} houseStates={houseStates} positions={positions} routes={routes} shelterFill={fill} cone={{ bearingDeg: bearing, radiusPx: coneR, opacity: 1 }} fireScale={1 + t * 0.012} />

      <Stat label="EN MOVIMIENTO" value={moving} color={C.person} x={80} y={110} />
      <Stat label="A SALVO" value={safe} color={C.route} x={80} y={250} />
      <Stat label="SIN RESPUESTA" value={scene.counts.noAnswer} color={C.danger} x={80} y={390} small />

      {/* Aviso de viento */}
      {t >= windShiftAt && (
        <div
          style={{
            position: "absolute",
            left: 80,
            top: 500,
            fontFamily: FONT.mono,
            color: C.fire,
            fontSize: 18,
            letterSpacing: 3,
            padding: "12px 16px",
            border: `1px solid ${C.fire}`,
            borderRadius: 8,
            background: "rgba(255,90,31,0.08)",
            opacity: interpolate(t, [windShiftAt, windShiftAt + 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * (0.75 + 0.25 * Math.sin(t * 6)),
          }}
        >
          ⚠ GIRO DE VIENTO · PLAN INVÁLIDO
        </div>
      )}

      <DecisionLog entries={log} visible={logVisible} x={1380} y={300} w={480} />

      <SyntheticBadge />
      <Narration lines={def.lines} />
    </Background>
  );
};
