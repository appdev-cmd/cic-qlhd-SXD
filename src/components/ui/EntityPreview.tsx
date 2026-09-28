import React, { lazy, Suspense, useEffect, useState } from 'react';
import { apiRequest } from '../../services/apiClient';
import { projectService } from '../../services/projectService';
import { formatDate } from '../../lib/utils';
import type { EntityLinkProps } from './EntityLink';
const ProjectPanel = lazy(() =>
  import('../../pages/projects/ProjectDetailSlidePanel').then((m) => ({ default: m.ProjectDetailSlidePanel })),
);
const AppraisalPanel = lazy(() =>
  import('../../pages/projects/appraisal/AppraisalWorkspace').then((m) => ({ default: m.AppraisalWorkspace })),
);
const SubmissionPanel = lazy(() =>
  import('../appraisal/SubmissionWorkspace').then((m) => ({ default: m.SubmissionWorkspace })),
);
const fields: Record<string, string> = {
  name: 'Tên đơn vị',
  full_name: 'Họ tên',
  code: 'Mã',
  address: 'Địa chỉ',
  phone: 'Điện thoại',
  email: 'Email',
  tax_code: 'Mã số thuế',
  legal_rep: 'Người đại diện',
  org_name: 'Đơn vị',
  cert_number: 'Số chứng chỉ',
  cert_grade: 'Hạng chứng chỉ',
  cert_expiry: 'Ngày hết hạn',
};
export function EntityPreview({ type, id }: Pick<EntityLinkProps, 'type' | 'id'>) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    const request =
      type === 'project'
        ? projectService.getById(id)
        : apiRequest(
            type === 'dossier'
              ? '/cases/' + encodeURIComponent(id)
              : '/entities/' + type + '/' + encodeURIComponent(id),
          );
    request
      .then((value) => {
        if (current) setData(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [type, id]);
  if (error)
    return (
      <p role="alert" className="text-red-700 dark:text-red-300">
        {error}
      </p>
    );
  if (!data) return <p className="text-ink dark:text-ink">Đang tải…</p>;
  return (
    <Suspense fallback={<p className="text-ink dark:text-ink">Đang tải nội dung…</p>}>
      {type === 'project' ? (
        <ProjectPanel project={data} />
      ) : type === 'dossier' ? (
        data.procedure === 'bcnckt' ? (
          <AppraisalPanel dossierId={id} />
        ) : (
          <SubmissionPanel dossierId={id} />
        )
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-ink dark:text-ink">
          {Object.entries(fields)
            .filter(([key]) => data[key] != null)
            .map(([key, label]) => (
              <div key={key}>
                <dt className="text-ink-muted dark:text-ink-muted">{label}</dt>
                <dd className="mt-1 font-medium">
                  {key === 'cert_expiry' ? formatDate(data[key]) : String(data[key])}
                </dd>
              </div>
            ))}
        </dl>
      )}
    </Suspense>
  );
}
