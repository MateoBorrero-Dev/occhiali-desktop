import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { ClientsPage } from '../pages/ClientsPage';
import { ClientCreatePage } from '../pages/ClientCreatePage';
import { ClientDetailPage } from '../pages/ClientDetailPage';
import { ClientEditPage } from '../pages/ClientEditPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PrescriptionCreatePage } from '../pages/PrescriptionCreatePage';
import { PrescriptionDetailPage } from '../pages/PrescriptionDetailPage';
import { PrescriptionCorrectionPage } from '../pages/PrescriptionCorrectionPage';
import { SettingsPage } from '../pages/SettingsPage';
import { OpticalJobDetailPage } from '../pages/OpticalJobDetailPage';
import { OpticalJobEditPage } from '../pages/OpticalJobEditPage';
import { DeliveryReceiptCreatePage } from '../pages/DeliveryReceiptCreatePage';
import { DeliveryReceiptDetailPage } from '../pages/DeliveryReceiptDetailPage';
import { DeliveryReceiptsPage } from '../pages/DeliveryReceiptsPage';
import { OpticalFilesPage } from '../pages/OpticalFilesPage';

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
          <Route path="clientes/:id/trabajos/nuevo" element={<PrescriptionCreatePage />} />
          <Route path="fichas" element={<OpticalFilesPage />} />
          <Route path="fichas/nueva" element={<PrescriptionCreatePage />} />
          <Route path="fichas/trabajo/:id" element={<OpticalJobDetailPage />} />
          <Route path="fichas/trabajo/:id/editar" element={<OpticalJobEditPage />} />
          <Route path="fichas/trabajo/:id/retiro/nuevo" element={<DeliveryReceiptCreatePage />} />
          <Route path="fichas/receta/:id" element={<PrescriptionDetailPage />} />
          <Route path="fichas/receta/:id/corregir" element={<PrescriptionCorrectionPage />} />
          <Route path="recetas-trabajos" element={<Navigate replace to="/fichas" />} />
          <Route path="recetas" element={<Navigate replace to="/fichas" />} />
          <Route path="recetas/nueva" element={<PrescriptionCreatePage />} />
          <Route path="recetas/:id" element={<PrescriptionDetailPage />} />
          <Route path="recetas/:id/corregir" element={<PrescriptionCorrectionPage />} />
          <Route path="trabajos" element={<Navigate replace to="/fichas" />} />
          <Route path="trabajos/nuevo" element={<PrescriptionCreatePage />} />
          <Route path="trabajos/:id" element={<OpticalJobDetailPage />} />
          <Route path="trabajos/:id/editar" element={<OpticalJobEditPage />} />
          <Route path="trabajos/:id/retiro/nuevo" element={<DeliveryReceiptCreatePage />} />
          <Route path="retiros" element={<DeliveryReceiptsPage />} />
          <Route path="retiros/:id" element={<DeliveryReceiptDetailPage />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
