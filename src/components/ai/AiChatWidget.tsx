import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { Modal } from '../ui/Modal';
import { LegalAssistant } from './LegalAssistant';

/**
 * Nút mở Trợ lý AI Pháp luật trên thanh trên (trước đây là nút nổi góc dưới phải — che nút phân trang).
 */
export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <Tooltip content="Trợ lý AI Pháp luật — tra cứu có trích dẫn nguồn" placement="bottom">
        <button
          type="button"
          aria-label="Trợ lý AI Pháp luật"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm font-semibold text-primary-700 dark:text-primary-200 hover:bg-primary-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Bot size={17} />
          <span className="hidden xl:inline">Trợ lý AI</span>
        </button>
      </Tooltip>
      {open && (
        <Modal dirty={dirty} heading="Trợ lý AI Pháp luật" onClose={() => setOpen(false)} size="xl">
          <LegalAssistant onDirtyChange={setDirty} />
        </Modal>
      )}
    </>
  );
}
