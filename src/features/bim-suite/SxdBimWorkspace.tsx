import { Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { BimAccessProvider } from './adapters/context';
import { ToastProvider } from './adapters/toast';
import { ConfirmProvider } from './adapters/ui';
import { BimProjectWorkspace } from './components/BimProjectWorkspace';
import './sxd-bim.css';
import { isBimStaticDemo, loadBimDemo } from './adapters/staticDemo';

export function SxdBimWorkspace({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { profile, session } = useAuth();
  const [scope, setScope] = useState<{ id: string; organizationId: string } | null>(null);
  const [error, setError] = useState('');
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  useEffect(() => {
    let alive = true;
    if (isBimStaticDemo()) {
      loadBimDemo()
        .then((data) => {
          if (alive) setScope(data.scope);
        })
        .catch((error) => {
          if (alive) setError(error.message);
        });
      return () => {
        alive = false;
        client.clear();
      };
    }
    supabase.rpc('sxd_bim_workspace', { p_target: projectId }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(error.message);
      else setScope(data);
    });
    return () => {
      alive = false;
      client.clear();
    };
  }, [projectId, client]);
  const canWrite =
    !isBimStaticDemo() && ['officer', 'head_of_department', 'director', 'admin'].includes(profile?.role || '');
  const canManage = !isBimStaticDemo() && ['head_of_department', 'director', 'admin'].includes(profile?.role || '');
  if (error)
    return (
      <p role="alert" className="text-danger-700 dark:text-danger-300">
        {error}
      </p>
    );
  if (!scope)
    return (
      <p role="status" className="p-6 text-ink dark:text-slate-100">
        Đang mở không gian BIM…
      </p>
    );
  return (
    <div className="bim-suite text-ink dark:text-slate-100" key={session?.user.id}>
      {isBimStaticDemo() && (
        <p role="status" className="mb-2 text-xs text-ink-muted dark:text-slate-400">
          Bộ mô hình BIM NOXH HVT · Bản trình diễn chỉ đọc. Xem 3D, thuộc tính và đo đạc trực tiếp trên mô hình.
        </p>
      )}
      <QueryClientProvider client={client}>
        <BimAccessProvider
          access={{
            organizationId: scope.organizationId,
            projectId: scope.id,
            canWrite,
            canManage,
            isOrgAdmin: !isBimStaticDemo() && profile?.role === 'admin',
          }}
        >
          <ToastProvider>
            <ConfirmProvider>
              <Suspense
                fallback={
                  <p role="status" className="p-6">
                    Đang tải công cụ BIM…
                  </p>
                }
              >
                <BimProjectWorkspace projectId={scope.id} projectName={projectName} />
              </Suspense>
            </ConfirmProvider>
          </ToastProvider>
        </BimAccessProvider>
      </QueryClientProvider>
    </div>
  );
}
