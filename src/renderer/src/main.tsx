import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SecurityGate } from './components/security/SecurityGate';
import './styles/global.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

createRoot(rootElement).render(
  <StrictMode>
    <SecurityGate />
  </StrictMode>,
);
