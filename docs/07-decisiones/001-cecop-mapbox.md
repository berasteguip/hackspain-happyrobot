# 001 — El CECOP se construye como frontend Mapbox propio, no como HappyRobot App todavía

> **Fecha:** 2026-09-19 · **Estado:** aceptada

## Contexto

Necesitamos un centro de mando con mapa (focos, zonas seguras, personas) para la
demo. HappyRobot tiene Apps, pero el acceso y el empaquetado aún no están
cerrados, y Mapbox no vive de serie en esa superficie.

## Decisión

El mando va en `apps/command-center` (Vite + React + Mapbox GL JS). HappyRobot
entra por las llamadas; el mapa es nuestro. Las Apps de la plataforma se
evalúan más tarde si hay que incrustar el CECOP dentro de HappyRobot.

## Alternativas descartadas

- Leaflet / MapLibre: el requisito explícito era Mapbox.
- Esperar a HappyRobot Apps: bloqueaba el arranque del frontend.
- Backend completo de tracking: para la v0 basta simulación + un POST local.

## Consecuencias

- Hace falta un token público de Mapbox (`.env` o pegarlo en la UI).
- El tracking real entre dispositivos en local usa el middleware de Vite; en
  producción hará falta un endpoint de verdad.
