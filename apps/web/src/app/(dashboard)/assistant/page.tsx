"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Bot, User } from "lucide-react";
import { useState } from "react";

export default function AssistantPage() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Chào bạn, tôi là Trợ lý AI Pháp luật Xây dựng. Tôi có thể giúp gì cho bạn hôm nay?", citations: [] },
    { role: "user", content: "Quy định về thời gian thẩm định Báo cáo nghiên cứu khả thi dự án nhóm B?", citations: [] },
    { role: "assistant", content: "Theo quy định hiện hành, thời gian thẩm định Báo cáo nghiên cứu khả thi đối với dự án nhóm B là không quá 20 ngày kể từ ngày nhận đủ hồ sơ hợp lệ.", citations: ["Khoản 2 Điều 59 Luật Xây dựng 2014", "Sửa đổi tại Luật Xây dựng 2020"] }
  ]);
  const [input, setInput] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages([...messages, { role: "user", content: input, citations: [] }]);
    setInput("");
    // Simulate AI typing here...
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Trợ lý AI Pháp luật Xây dựng</h2>
        <p className="text-sm text-muted-foreground">AI hỗ trợ tra cứu, không thay thế quyết định chuyên môn.</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-slate-200'}`}>
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={`max-w-[80%] rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-slate-100'}`}>
                {msg.content}
                {msg.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {msg.citations.map((cite, j) => (
                      <span key={j} className="inline-flex text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                        {cite}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
        <div className="p-4 border-t bg-background">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Nhập câu hỏi về quy định, thủ tục xây dựng..." 
              className="flex-1"
            />
            <Button type="submit"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
