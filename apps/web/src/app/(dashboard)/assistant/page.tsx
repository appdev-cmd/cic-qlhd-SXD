"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/Tooltip";
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  BookOpen, 
  Scale, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  Loader2 
} from "lucide-react";
import api from "@/lib/api";

interface MessageItem {
  id: string;
  role: "assistant" | "user";
  content: string;
  citations?: Array<{ source: string; article?: string; content?: string } | string>;
  confidence?: number;
  time: string;
}

const INITIAL_MESSAGES: MessageItem[] = [
  {
    id: "init-1",
    role: "assistant",
    content: "Xin chào đồng chí! Tôi là Trợ lý AI Pháp luật Xây dựng, được huấn luyện dựa trên Luật Xây dựng 2025, Nghị định 217/2026/NĐ-CP và Quy chuẩn kỹ thuật QCVN áp dụng tại tỉnh Điện Biên. Đồng chí cần tra cứu quy định hay thủ tục thẩm định nào hôm nay?",
    citations: [],
    time: "Hệ thống",
  },
  {
    id: "init-2",
    role: "user",
    content: "Thời hạn thẩm định Báo cáo nghiên cứu khả thi dự án nhóm B được quy định như thế nào?",
    citations: [],
    time: "Ví dụ",
  },
  {
    id: "init-3",
    role: "assistant",
    content: "Căn cứ Nghị định số 217/2026/NĐ-CP (Điều 14) và Luật Xây dựng 2025:\n\n1. Thời hạn kiểm tra tính hợp lệ của hồ sơ: Không quá 05 ngày làm việc kể từ ngày tiếp nhận.\n2. Thời hạn thẩm định Báo cáo NCKT (kể từ ngày nhận đủ hồ sơ hợp lệ):\n   - Dự án nhóm A: Không quá 40 ngày làm việc.\n   - Dự án nhóm B: Không quá 20 ngày làm việc (công trình cấp I), tối đa 16 ngày (cấp còn lại).\n   - Dự án nhóm C: Không quá 15 ngày làm việc (công trình cấp I), tối đa 12 ngày (cấp còn lại).",
    citations: [
      { source: "Nghị định 217/2026/NĐ-CP", article: "Điều 14, Khoản 2", content: "Thời hạn thẩm định dự án đầu tư xây dựng" },
      { source: "Luật Xây dựng 2025", article: "Điều 59", content: "Trình tự, thời hạn thẩm định Báo cáo NCKT" },
    ],
    confidence: 0.96,
    time: "Phản hồi mẫu",
  },
];

const SUGGESTED_QUESTIONS = [
  "Thời hạn thẩm định dự án nhóm B theo NĐ 217/2026/NĐ-CP?",
  "Thẩm quyền thẩm định của Sở Xây dựng đối với công trình cấp II?",
  "Trường hợp nào được miễn Giấy phép xây dựng?",
  "Quy chuẩn kỹ thuật bắt buộc về an toàn PCCC công trình?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<MessageItem[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputVal).trim();
    if (!query || isLoading) return;

    const userMsg: MessageItem = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal("");
    setIsLoading(true);

    try {
      const res = await api.askLegalAI(query);
      const assistantMsg: MessageItem = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: res.answer || "Đã xử lý thông tin thẩm tra.",
        citations: res.citations || [],
        confidence: res.confidence,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: MessageItem = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `Rất tiếc, đã xảy ra lỗi trong quá trình tra cứu: ${err?.message || "Vui lòng thử lại sau."}`,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleResetChat = () => {
    setMessages(INITIAL_MESSAGES);
    setInputVal("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)] max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400">
              <Scale className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Trợ lý AI Pháp luật Xây dựng
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <Sparkles className="h-3 w-3" />
              Nghị định 217/2026/NĐ-CP
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Hỗ trợ tra cứu quy chuẩn, tiêu chuẩn, trình tự thủ tục hành chính ngành Xây dựng tỉnh Điện Biên
          </p>
        </div>

        <Tooltip content="Thiết lập lại cuộc trò chuyện">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetChat}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Làm mới
          </Button>
        </Tooltip>
      </div>

      {/* Suggestion Chips */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-xs font-medium text-slate-500 shrink-0 mr-1">Gợi ý nhanh:</span>
        {SUGGESTED_QUESTIONS.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(item)}
            className="shrink-0 text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:border-orange-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-950/30 transition-all cursor-pointer shadow-2xs"
          >
            {item}
          </button>
        ))}
      </div>

      {/* Main Chat Card */}
      <Card className="flex-1 flex flex-col overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
        <CardContent
          ref={scrollAreaRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
        >
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-xs ${
                    isUser
                      ? "bg-orange-500 text-white"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-orange-500" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-xs ${
                    isUser
                      ? "bg-orange-500 text-white rounded-tr-xs"
                      : "bg-slate-50 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 rounded-tl-xs border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {/* Content text */}
                  <div className="whitespace-pre-line leading-relaxed">
                    {msg.content}
                  </div>

                  {/* Legal Citations and Confidence */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/80">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <BookOpen className="h-3.5 w-3.5 text-orange-500" />
                          Căn cứ pháp lý viện dẫn:
                        </span>
                        {msg.confidence && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Độ tin cậy: {Math.round(msg.confidence * 100)}%
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {msg.citations.map((cite, j) => {
                          const isObj = typeof cite === "object" && cite !== null;
                          const title = isObj ? cite.source : cite;
                          const sub = isObj ? cite.article : null;
                          const desc = isObj ? cite.content : null;

                          return (
                            <div
                              key={j}
                              className="rounded-lg bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 p-2 text-xs"
                            >
                              <div className="flex items-center justify-between font-medium text-orange-700 dark:text-orange-400">
                                <span>{title}</span>
                                {sub && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                                    {sub}
                                  </span>
                                )}
                              </div>
                              {desc && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {desc}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Time label */}
                  <div className={`mt-1.5 text-[10px] text-right ${isUser ? "text-orange-100" : "text-muted-foreground"}`}>
                    {msg.time}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex gap-3 items-center">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <Bot className="h-4 w-4 text-orange-500 animate-pulse" />
              </div>
              <div className="rounded-2xl rounded-tl-xs bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span>AI đang đối soát văn bản quy phạm pháp luật...</span>
              </div>
            </div>
          )}
        </CardContent>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Nhập câu hỏi pháp lý, thủ tục thẩm định hoặc số hiệu quy chuẩn kỹ thuật..."
              disabled={isLoading}
              className="flex h-10 w-full flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:opacity-50"
            />
            <Button
              type="submit"
              disabled={isLoading || !inputVal.trim()}
              className="h-10 px-4 rounded-xl gap-2 font-medium"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Gửi câu hỏi</span>
            </Button>
          </form>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              Thông tin tra cứu chỉ mang tính chất tham khảo, không thay thế quyết định thẩm định chính thức.
            </span>
            <span className="hidden md:inline">Nhấn Enter để gửi</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
