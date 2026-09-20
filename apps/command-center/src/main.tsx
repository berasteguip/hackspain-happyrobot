import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ONBOARDING_PATH, shouldRedirectToOnboarding } from './onboarding'

// La primera visita entra por el onboarding. Se decide antes de montar nada para que nadie vea
// medio puesto de mando aparecer y desaparecer.
if (shouldRedirectToOnboarding()) {
  window.location.replace(ONBOARDING_PATH)
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
