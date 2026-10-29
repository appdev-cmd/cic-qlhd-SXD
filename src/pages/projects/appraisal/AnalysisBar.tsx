import React, { useState } from 'react';
import { Play, RefreshCw, Square } from 'lucide-react';
import type { Dossier } from '../../../types/appraisal';
import { AnalysisFeedback } from '../../../components/appraisal/AnalysisFeedback';
import { Button, IconButton } from '../../../components/ui/Button';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import type { AppraisalCase } from '../../../hooks/useAppraisalCase';
import { Notice } from './shared';

/** "Chạy kiểm tra hồ sơ" controls (scope, optional AI model, cancel, reload) and the run feedback. */
export function AnalysisBar({
  c,
  d,
  anchorRef,
  onResults,
}: {
  c: AppraisalCase;
  d: Dossier;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onResults: () => void;
}) {
  const [mode, setMode] = useState('intake');
  const [useModel, setUseModel] = useState(false);
  const running = d.job?.status === 'running';
  const run = d.runs.slice(-1)[0];
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-60">
          <SearchableSelect
            value={mode}
            onChange={setMode}
            options={[
              { value: 'intake', label: 'Kiểm tra đầu vào hiện tại' },
              { value: 'comparison', label: 'Đối chiếu cả tài liệu tham khảo' },
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-primary-500 dark:accent-primary-400"
            checked={useModel}
            disabled={!c.health?.modelConfigured}
            onChange={(e) => setUseModel(e.target.checked)}
          />
          Phân tích thêm bằng mô hình AI
        </label>
        {!c.health?.modelConfigured && (
          <span className="text-xs text-ink-muted dark:text-slate-400">
            AI chưa sẵn sàng. Vẫn có thể chạy kiểm tra theo quy tắc.
          </span>
        )}
        <Button
          leftIcon={<Play size={14} />}
          disabled={c.busy || c.starting || d.readOnly || running}
          onClick={() => c.startAnalysis(mode, useModel)}
        >
          {c.starting ? 'Đang gửi yêu cầu…' : running ? 'Đang kiểm tra…' : 'Chạy kiểm tra hồ sơ'}
        </Button>
        {running && (
          <Button variant="secondary" leftIcon={<Square size={14} />} onClick={c.cancelAnalysis}>
            Hủy lượt chạy
          </Button>
        )}
        <IconButton
          aria-label="Tải lại dữ liệu"
          tooltip="Tải lại dữ liệu"
          tooltipPlacement="bottom"
          variant="secondary"
          icon={<RefreshCw size={14} />}
          disabled={c.busy}
          onClick={() => c.action(c.refresh)}
        />
      </div>
      <div ref={anchorRef} className="scroll-mt-4 space-y-2">
        <AnalysisFeedback dossier={d} starting={c.starting} onResults={onResults} />
        {c.pollError && (
          <Notice tone="warning" role="alert">
            {c.pollError}
          </Notice>
        )}
      </div>
      {run?.stale && (
        <Notice tone="warning">
          Tài liệu hoặc dữ liệu đã thay đổi. Chạy lại kiểm tra trước khi đánh giá và xuất kết quả.
        </Notice>
      )}
    </>
  );
}
