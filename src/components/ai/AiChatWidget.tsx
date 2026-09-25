import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Maximize2, Minimize2, Sparkles, BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/Tooltip';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  citations?: { source: string; article: string; url?: string }[];
  timestamp: string;
}

const PRESET_QUESTIONS = [
  'Thẩm quyền thẩm định BCNCKT của Sở Xây dựng gồm những dự án nào?',
  'Thời hạn thẩm định dự án nhóm B công trình cấp I là bao nhiêu ngày?',
  'Hồ sơ cấp Giấy phép xây dựng theo NĐ 217/2026 gồm những tài liệu gì?',
  'Các yêu cầu cốt lõi về lối thoát nạn theo QCVN 06:2022/BXD SĐ1:2023?',
  'Quy định về thẩm tra thiết kế sau TKCS theo khoản 5 Điều 26 Luật XD 2025?',
];

export function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'ai',
      text: 'Xin chào đồng chí! Tôi là **Trợ lý AI Pháp luật Xây dựng** của Sở Xây dựng tỉnh Điện Biên. Tôi có thể hỗ trợ đồng chí tra cứu nhanh các quy định theo **Luật Xây dựng 2025**, **Nghị định 217/2026/NĐ-CP**, **Nghị định 206/2026/NĐ-CP**, **Nghị định 207/2026/NĐ-CP** và hệ thống quy chuẩn kỹ thuật (QCVN 01, QCVN 06...).',
      citations: [
        { source: 'Luật Xây dựng số 135/2025/QH15', article: 'Điều 27, Điều 46' },
        { source: 'Nghị định số 217/2026/NĐ-CP', article: 'Điều 32, 38, 53' },
      ],
      timestamp: '08:30',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = (textToSend?: string) => {
    const q = textToSend || input;
    if (!q.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsLoading(true);

    // Giả lập trả lời của AI RAG có trích dẫn chuẩn xác
    setTimeout(() => {
      let replyText = '';
      let citations: { source: string; article: string }[] = [];

      const queryLower = q.toLowerCase();
      if (queryLower.includes('thẩm quyền') || queryLower.includes('dự án nào')) {
        replyText =
          'Theo **Điều 32 Nghị định 217/2026/NĐ-CP**, Sở Xây dựng thẩm định BCNCKT đối với các dự án xây dựng trên địa bàn tỉnh bao gồm:\n' +
          '1. **Dự án đầu tư công** (trừ dự án do UBND cấp xã quyết định đầu tư và dự án cấp đặc biệt của Bộ chuyên ngành);\n' +
          '2. **Dự án PPP** do cơ quan cấp tỉnh có thẩm quyền ký kết hợp đồng;\n' +
          '3. **Dự án đầu tư kinh doanh** có công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng thuộc danh mục tại **Phụ lục IV NĐ 217/2026/NĐ-CP** (tòa nhà tập trung đông người, trung tâm thương mại, chung cư...).';
        citations = [
          { source: 'Nghị định 217/2026/NĐ-CP', article: 'Điều 32 Khoản 1 & Khoản 5' },
          { source: 'Luật Xây dựng 2025', article: 'Khoản 1 Điều 27' },
        ];
      } else if (queryLower.includes('thời hạn') || queryLower.includes('thời gian') || queryLower.includes('sla')) {
        replyText =
          'Theo **Điều 37 Nghị định 217/2026/NĐ-CP**, thời gian thẩm định BCNCKT được tính theo **ngày làm việc** (không tính thứ 7, CN, ngày nghỉ lễ):\n' +
          '• **Dự án nhóm A:** Không quá 25 ngày làm việc (công trình cấp I trở lên); không quá 20 ngày (các dự án còn lại).\n' +
          '• **Dự án nhóm B:** Không quá 20 ngày làm việc (công trình cấp I trở lên); không quá 16 ngày (các dự án còn lại).\n' +
          '• **Dự án nhóm C:** Không quá 15 ngày làm việc (công trình cấp I trở lên); không quá 12 ngày (các dự án còn lại).\n' +
          'Cơ quan thẩm định chỉ được gia hạn tối đa 01 lần và phải có văn bản thông báo nêu rõ lý do.';
        citations = [{ source: 'Nghị định 217/2026/NĐ-CP', article: 'Điều 37 Khoản 1' }];
      } else if (queryLower.includes('pccc') || queryLower.includes('thoát nạn') || queryLower.includes('an toàn cháy')) {
        replyText =
          'Theo **QCVN 06:2022/BXD** và **Sửa đổi 1:2023**, các yêu cầu an toàn PCCC cốt lõi khi thẩm định thiết kế cơ sở gồm:\n' +
          '1. **Bậc chịu lửa:** Phải phù hợp với số tầng, diện tích khoang cháy và quy mô công trình.\n' +
          '2. **Lối thoát nạn:** Số lượng lối thoát tối thiểu từ mỗi tầng/phòng phải từ 2 lối trở lên (trừ trường hợp quy mô nhỏ đặc biệt). Chiều rộng hành lang thoát nạn không nhỏ hơn 1.2m (hoặc 1.4m đối với công trình công cộng đông người).\n' +
          '3. **Đường tiếp cận xe chữa cháy:** Chiều rộng thông thủy bãi đỗ xe chữa cháy tối thiểu 6.0m, khoảng cách đến tường ngoài công trình từ 5m đến 10m.\n' +
          '4. **Hồ sơ:** Bắt buộc có Văn bản thỏa thuận/góp ý thiết kế PCCC của Phòng Cảnh sát PCCC & CNCH - Công an tỉnh Điện Biên.';
        citations = [
          { source: 'QCVN 06:2022/BXD', article: 'Mục 3 (Thoát nạn), Mục 6 (Chữa cháy)' },
          { source: 'Nghị định 217/2026/NĐ-CP', article: 'Điều 38 Khoản 4' },
        ];
      } else {
        replyText =
          `Căn cứ câu hỏi của đồng chí về "${q}":\n` +
          'Hệ thống đang trích xuất dữ liệu từ kho tri thức pháp lý của Sở Xây dựng Điện Biên. Đối với nội dung này, đồng chí cần lưu ý kiểm tra đối chiếu kỹ giữa quy chuẩn chuyên ngành và các quyết định phân cấp của UBND tỉnh Điện Biên theo Nghị định 140/2025/NĐ-CP.';
        citations = [
          { source: 'Nghị định số 217/2026/NĐ-CP', article: 'Điều 35, 36, 38' },
          { source: 'Quyết định UBND tỉnh Điện Biên', article: 'Về phân cấp QLXD 2026' },
        ];
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: replyText,
        citations,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsLoading(false);
    }, 800);
  };

  return (
    <>
      {/* Nút tròn nổi góc phải dưới — Thiết kế bé gọn thanh lịch */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 z-40">
          <Tooltip content="Trợ lý AI Pháp luật" placement="left">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label="Trợ lý AI Pháp luật"
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center cursor-pointer',
                'bg-primary-600 hover:bg-primary-700 text-white shadow-lg transition-all duration-200 hover:scale-110 active:scale-95',
                'border border-white/20'
              )}
            >
              <div className="relative flex items-center justify-center">
                <Bot size={17} />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-primary-600" />
              </div>
            </button>
          </Tooltip>
        </div>
      )}

      {/* Cửa sổ Chatbot RAG */}
      {isOpen && (
        <div
          style={{
            width: isExpanded ? '640px' : '400px',
            height: isExpanded ? '720px' : '520px',
          }}
          className={cn(
            'fixed bottom-6 right-6 z-50 rounded-2xl border border-border bg-surface shadow-2xl flex flex-col overflow-hidden',
            'animate-fade-in transition-all duration-300'
          )}
        >
          {/* Header Chat */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-subtle/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Sparkles size={16} />
              </div>
              <div className="truncate">
                <h4 className="text-xs font-bold text-ink truncate">Trợ lý AI Pháp luật Xây dựng</h4>
                <p className="text-3xs text-ink-muted flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  RAG Pháp quy • NĐ 217/2026 & QCVN
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-ink-muted">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-md hover:bg-surface hover:text-ink transition-colors"
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-md hover:bg-surface hover:text-ink transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Danh sách Tin nhắn */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex flex-col', m.sender === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed',
                    m.sender === 'user'
                      ? 'bg-primary-500 text-white rounded-br-none shadow-sm'
                      : 'bg-subtle text-ink rounded-bl-none border border-border shadow-xs'
                  )}
                >
                  <p className="whitespace-pre-line">{m.text}</p>

                  {/* Trích dẫn Căn cứ pháp lý */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/60 text-2xs space-y-1">
                      <span className="font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1">
                        <BookOpen size={11} /> Căn cứ pháp lý trích dẫn:
                      </span>
                      {m.citations.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-ink-muted pl-3">
                          <span>• {c.source} ({c.article})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-3xs text-ink-muted mt-1 px-1">{m.timestamp}</span>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-2xs text-ink-muted italic">
                <RefreshCw size={12} className="animate-spin text-primary-500" />
                <span>AI đang tra cứu văn bản pháp luật...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Gợi ý câu hỏi nhanh */}
          <div className="px-3 py-2 border-t border-border bg-subtle/40 overflow-x-auto flex gap-1.5 scrollbar-none">
            {PRESET_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-surface border border-border text-2xs text-ink-secondary hover:border-primary-500 hover:text-primary-600 transition-colors shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Ô nhập tin nhắn */}
          <div className="p-3 border-t border-border bg-surface flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Đặt câu hỏi pháp luật, quy chuẩn, thẩm quyền..."
              className="flex-1 px-3 py-2 text-xs rounded-xl border border-border bg-subtle text-ink outline-none focus:border-primary-500"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white transition-colors"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
