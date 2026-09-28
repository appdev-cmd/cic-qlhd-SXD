import React,{lazy,Suspense} from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SlidePanelProvider } from './context/SlidePanelContext';
import { AppLayout } from './layouts/AppLayout';
import { AuthProvider,useAuth } from './context/AuthContext';
import { RequireAuth } from './components/auth/RequireAuth';

const DashboardPage=lazy(()=>import('./pages/DashboardPage').then(module=>({default:module.DashboardPage})));
const ProjectsPage=lazy(()=>import('./pages/ProjectsPage').then(module=>({default:module.ProjectsPage})));
const OrganizationsPage=lazy(()=>import('./pages/OrganizationsPage').then(module=>({default:module.OrganizationsPage})));
const PersonnelPage=lazy(()=>import('./pages/PersonnelPage').then(module=>({default:module.PersonnelPage})));
const LegalAiPage=lazy(()=>import('./pages/LegalAiPage').then(module=>({default:module.LegalAiPage})));
const CostDatabasePage=lazy(()=>import('./pages/CostDatabasePage').then(module=>({default:module.CostDatabasePage})));
const GisMapPage=lazy(()=>import('./pages/GisMapPage').then(module=>({default:module.GisMapPage})));
const DocumentsPage=lazy(()=>import('./pages/DocumentsPage').then(module=>({default:module.DocumentsPage})));
const SettingsPage=lazy(()=>import('./pages/SettingsPage').then(module=>({default:module.SettingsPage})));
const AppraisalPage=lazy(()=>import('./pages/AppraisalPage').then(module=>({default:module.AppraisalPage})));

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider><RequireAuth><AuthenticatedApp /></RequireAuth></AuthProvider>
    </ThemeProvider>
  );
}

function AuthenticatedApp(){
  const {session}=useAuth();
  return <SlidePanelProvider key={session?.user.id||'demo'}>
        <BrowserRouter>
          <Suspense fallback={<p className="p-6 text-ink dark:text-ink">Đang tải phân hệ…</p>}><Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="appraisal" element={<Navigate to="/projects/appraisal" replace />} />
              <Route path="projects/appraisal" element={<AppraisalPage key="bcnckt" procedure="bcnckt" />} />
              <Route path="projects/permits" element={<AppraisalPage key="gpxd" procedure="gpxd" />} />
              <Route path="projects/inspections" element={<AppraisalPage key="nghiem_thu" procedure="nghiem_thu" />} />
              <Route path="dossiers/:id" element={<AppraisalPage />} />
              <Route path="organizations" element={<OrganizationsPage />} />
              <Route path="personnel" element={<PersonnelPage />} />
              <Route path="legal-ai" element={<LegalAiPage />} />
              <Route path="cost-database" element={<CostDatabasePage />} />
              <Route path="gis-map" element={<GisMapPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes></Suspense>
        </BrowserRouter>
      </SlidePanelProvider>
  ;
}

export default App;
