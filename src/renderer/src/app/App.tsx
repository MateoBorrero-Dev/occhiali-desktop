import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { ClientsPage } from '../pages/ClientsPage';
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
          <Route path="recetas" element={<PrescriptionsPage />} />
          <Route path="trabajos" element={<WorkPage />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
