import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SlidePanelProvider } from './context/SlidePanelContext';
import { AppLayout } from './layouts/AppLayout';

import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { PersonnelPage } from './pages/PersonnelPage';
import { LegalAiPage } from './pages/LegalAiPage';
import { CostDatabasePage } from './pages/CostDatabasePage';
import { GisMapPage } from './pages/GisMapPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <ThemeProvider>
      <SlidePanelProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="organizations" element={<OrganizationsPage />} />
              <Route path="personnel" element={<PersonnelPage />} />
              <Route path="legal-ai" element={<LegalAiPage />} />
              <Route path="cost-database" element={<CostDatabasePage />} />
              <Route path="gis-map" element={<GisMapPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SlidePanelProvider>
    </ThemeProvider>
  );
}

export default App;
