import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { SlidePanelProvider } from './context/SlidePanelContext';
import { CurrentUserProvider } from './context/CurrentUserContext';
import { AppLayout } from './layouts/AppLayout';
import { AutoTableTooltip } from './components/ui/AutoTableTooltip';
import { PanelLoading } from './components/entity/PanelState';

// Lazy-load từng trang để chia nhỏ bundle (recharts, bản đồ... chỉ tải khi cần)
const page = <T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage');
const ProjectsPage = page(() => import('./pages/ProjectsPage'), 'ProjectsPage');
const OrganizationsPage = page(() => import('./pages/OrganizationsPage'), 'OrganizationsPage');
const PersonnelPage = page(() => import('./pages/PersonnelPage'), 'PersonnelPage');
const LegalAiPage = page(() => import('./pages/LegalAiPage'), 'LegalAiPage');
const CostDatabasePage = page(() => import('./pages/CostDatabasePage'), 'CostDatabasePage');
const GisMapPage = page(() => import('./pages/GisMapPage'), 'GisMapPage');
const DocumentsPage = page(() => import('./pages/DocumentsPage'), 'DocumentsPage');
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const withSuspense = (el: ReactNode) => <Suspense fallback={<PanelLoading />}>{el}</Suspense>;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <SlidePanelProvider>
            <CurrentUserProvider>
              <AutoTableTooltip />
              <Routes>
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={withSuspense(<DashboardPage />)} />
                  <Route path="projects" element={withSuspense(<ProjectsPage />)} />
                  <Route path="projects/:entityId" element={withSuspense(<ProjectsPage />)} />
                  <Route path="dossiers/:entityId" element={withSuspense(<ProjectsPage />)} />
                  <Route path="organizations" element={withSuspense(<OrganizationsPage />)} />
                  <Route path="organizations/:entityId" element={withSuspense(<OrganizationsPage />)} />
                  <Route path="personnel" element={withSuspense(<PersonnelPage />)} />
                  <Route path="personnel/:entityId" element={withSuspense(<PersonnelPage />)} />
                  <Route path="legal-ai" element={withSuspense(<LegalAiPage />)} />
                  <Route path="cost-database" element={withSuspense(<CostDatabasePage />)} />
                  <Route path="gis-map" element={withSuspense(<GisMapPage />)} />
                  <Route path="documents" element={withSuspense(<DocumentsPage />)} />
                  <Route path="settings" element={withSuspense(<SettingsPage />)} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Routes>
            </CurrentUserProvider>
          </SlidePanelProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
