import React from "react";
import { C, FONT } from "../lib/theme";

// Móvil genérico (iOS-like) para la llamada entrante y el enlace de ubicación.
// Se usa como contenedor: el contenido de la pantalla lo pone cada escena.
export const PhoneMock: React.FC<{
  x: number;
  y: number;
  scale?: number;
  rotate?: number;
  children?: React.ReactNode;
}> = ({ x, y, scale = 1, rotate = 0, children }) => {
  const w = 380;
  const h = 800;
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: "center",
        borderRadius: 56,
        background: "#0b0b0f",
        border: "3px solid #2a2d38",
        boxShadow: "0 40px 100px rgba(0,0,0,0.7), inset 0 0 0 10px #000",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 18,
          left: "50%",
          transform: "translateX(-50%)",
          width: 120,
          height: 34,
          borderRadius: 20,
          background: "#000",
          zIndex: 2,
        }}
      />
      <div style={{ position: "absolute", inset: 10, borderRadius: 46, overflow: "hidden", background: "#0e0f16" }}>{children}</div>
    </div>
  );
};

export const IncomingCall: React.FC<{ from: string; sub: string; answered: boolean; seconds?: number }> = ({ from, sub, answered, seconds = 0 }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FONT.ui, color: "#fff" }}>
    <div style={{ marginTop: 130, fontSize: 30, fontWeight: 600, textAlign: "center", padding: "0 20px" }}>{from}</div>
    <div style={{ marginTop: 10, fontSize: 18, color: "#9aa0b4", textAlign: "center" }}>{sub}</div>
    <div style={{ marginTop: 16, fontSize: 18, color: "#9aa0b4", fontFamily: FONT.mono }}>
      {answered ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "llamada entrante…"}
    </div>
    <div
      style={{
        marginTop: 60,
        width: 130,
        height: 130,
        borderRadius: 65,
        background: "#2a2f45",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 56,
      }}
    >
      🛡️
    </div>
    <div style={{ position: "absolute", bottom: 70, left: 0, right: 0, display: "flex", justifyContent: answered ? "center" : "space-around", padding: "0 40px" }}>
      {!answered && <Btn color="#ff3b30" label="Rechazar" icon="✕" />}
      <Btn color={answered ? "#ff3b30" : "#34c759"} label={answered ? "Colgar" : "Aceptar"} icon="📞" />
    </div>
  </div>
);

const Btn: React.FC<{ color: string; label: string; icon: string }> = ({ color, label, icon }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
    <div style={{ width: 78, height: 78, borderRadius: 39, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>{icon}</div>
    <div style={{ fontSize: 15, color: "#cfd3e0" }}>{label}</div>
  </div>
);

// Pantalla del enlace de ubicación (frontend/gps).
export const ShareLocation: React.FC<{ step: 0 | 1 | 2 }> = ({ step }) => (
  <div style={{ position: "absolute", inset: 0, background: "#f4f5f9", fontFamily: FONT.ui, color: "#171a26", padding: "90px 26px 0" }}>
    <div style={{ fontSize: 13, letterSpacing: 2, color: "#6b7186", fontFamily: FONT.mono }}>PROTECCIÓN CIVIL · ZAMORA</div>
    <div style={{ fontSize: 26, fontWeight: 700, marginTop: 10, lineHeight: 1.2 }}>Comparta su ubicación para que le guiemos</div>
    <div style={{ fontSize: 16, color: "#6b7186", marginTop: 12, lineHeight: 1.4 }}>Solo se usa durante la emergencia. Se borra al terminar.</div>
    <div
      style={{
        marginTop: 40,
        height: 64,
        borderRadius: 16,
        background: step >= 1 ? "#38b36a" : "#5b5bd6",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 19,
        fontWeight: 600,
        boxShadow: step === 0 ? "0 10px 30px rgba(91,91,214,0.45)" : "none",
      }}
    >
      {step === 0 ? "Compartir ubicación" : step === 1 ? "Ubicación enviada ✓" : "Guiándole · siga las indicaciones"}
    </div>
    {step === 2 && (
      <div style={{ marginTop: 30, padding: 18, borderRadius: 14, background: "#fff", border: "1px solid #e4e6ef" }}>
        <div style={{ fontSize: 13, color: "#6b7186", fontFamily: FONT.mono, letterSpacing: 1 }}>SU PUNTO DE ENCUENTRO</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>Tábara · CRA León Felipe</div>
        <div style={{ fontSize: 15, color: "#6b7186", marginTop: 6 }}>Carretera de Tábara · le recoge Antonio (Seat León blanco) en 8 min</div>
      </div>
    )}
  </div>
);

export { C };
