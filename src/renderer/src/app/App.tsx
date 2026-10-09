import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { ClientsPage } from '../pages/ClientsPage';
import { ClientCreatePage } from '../pages/ClientCreatePage';
import { ClientDetailPage } from '../pages/ClientDetailPage';
import { ClientEditPage } from '../pages/ClientEditPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PrescriptionsPage } from '../pages/PrescriptionsPage';
import { PrescriptionCreatePage } from '../pages/PrescriptionCreatePage';
import { PrescriptionDetailPage } from '../pages/PrescriptionDetailPage';
import { PrescriptionCorrectionPage } from '../pages/PrescriptionCorrectionPage';
import { SettingsPage } from '../pages/SettingsPage';
import { WorkPage } from '../pages/WorkPage';
import { OpticalJobCreatePage } from '../pages/OpticalJobCreatePage';
import { OpticalJobDetailPage } from '../pages/OpticalJobDetailPage';
import { OpticalJobEditPage } from '../pages/OpticalJobEditPage';

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
          <Route path="clientes/:id/recetas/nueva" element={<PrescriptionCreatePage />} />
          <Route path="clientes/:id/trabajos/nuevo" element={<OpticalJobCreatePage />} />
          <Route path="recetas" element={<PrescriptionsPage />} />
          <Route path="recetas/nueva" element={<PrescriptionCreatePage />} />
          <Route path="recetas/:id" element={<PrescriptionDetailPage />} />
          <Route path="recetas/:id/corregir" element={<PrescriptionCorrectionPage />} />
          <Route path="trabajos" element={<WorkPage />} />
          <Route path="trabajos/nuevo" element={<OpticalJobCreatePage />} />
          <Route path="trabajos/:id" element={<OpticalJobDetailPage />} />
          <Route path="trabajos/:id/editar" element={<OpticalJobEditPage />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
