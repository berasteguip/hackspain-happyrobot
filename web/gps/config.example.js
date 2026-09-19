// Copia este fichero como config.js y ajusta los valores.
// config.js NO se comitea (ver .gitignore de esta carpeta).
window.GPS_CONFIG = {
  // Base de la API de estado de crisis (api/). Sin barra final.
  // En desarrollo local con mock-api.py: http://localhost:8000
  API_BASE_URL: "http://localhost:8000",

  // Header x-api-key exigido por la API (ver docs/06-producto/03-contrato-de-datos.md, HR_SHARED_SECRET).
  API_KEY: "cambiame",
};
