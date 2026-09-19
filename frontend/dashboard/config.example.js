/* ============================================================
   config.example.js — PLANTILLA versionada en git.
   Cópiala a config.js (que está en .gitignore) y pon los valores reales:

       cp config.example.js config.js

   config.js NO se sube al repo porque lleva la clave de la API.
   Si no existe config.js, el dashboard arranca igual con los valores por
   defecto (localhost:8000 y clave "cambiame") y avisa en la consola.
   ============================================================ */

window.DASHBOARD_CONFIG = {
  // API de estado (paquete backend/api/). Sin barra final.
  API_BASE_URL: "http://localhost:8000",

  // Debe coincidir con HR_SHARED_SECRET del backend. Viaja en la cabecera x-api-key.
  API_KEY: "cambiame",

  // Quién está delante de la pantalla: queda en el decision_log de cada intervención.
  OPERATOR: "puesto-de-mando",

  // Enlace de la Web call de HappyRobot para llamar desde el navegador en la demo.
  // Déjalo vacío si no lo tienes: el botón avisará en vez de romperse.
  WEB_CALL_URL: "",
};

/* Todo esto se puede sobrescribir por URL sin tocar ficheros:
     ?api=http://otro-host:8000   ?key=...   ?operator=luis   ?webcall=https://...
   Y para ensayar sin backend ninguno:
     ?mock=1                      (escenario local dentro del navegador)
*/
