import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { ClientsPage } from '../pages/ClientsPage';
import { ClientCreatePage } from '../pages/ClientCreatePage';
import { ClientDetailPage } from '../pages/ClientDetailPage';
import { ClientEditPage } from '../pages/ClientEditPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PrescriptionsPage } from '../pages/PrescriptionsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { WorkPage } from '../pages/WorkPage';

export function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="clientes/nuevo" element={<ClientCreatePage />} />
          <Route path="clientes/:id" element={<ClientDetailPage />} />
          <Route path="clientes/:id/editar" element={<ClientEditPage />} />
          <Route path="recetas" element={<PrescriptionsPage />} />
          <Route path="trabajos" element={<WorkPage />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
