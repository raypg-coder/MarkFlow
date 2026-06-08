import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Square,
  Plus,
  Copy,
  Check,
  CornerDownLeft,
  Settings as SettingsIcon,
  User,
  Sparkles,
} from "lucide-react";
import { marked } from "marked";
import { useStore } from "../store";
import { chatStream, type ChatMessage } from "../utils/llm";

function renderMarkdown(content: string): string {
  try {
    const html = marked.parse(content, { async: false }) as string;
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "");
  } catch {
    return content;
  }
}

type ContextMode = "none" | "doc";

export function AiPanel() {
  const {
    llmSettings,
    aiMessages,
    aiPending,
    aiPrefill,
    appendAiMessage,
    updateLastAiMessage,
    clearAiMessages,
    setAiPending,
    setAiPrefill,
    setSettingsOpen,
    openFiles,
    activePath,
  } = useStore();

  const [input, setInput] = useState("");
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<ContextMode>("doc");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeFile = openFiles.find((f) => f.path === activePath);
  const modelOptions = [
    llmSettings.chatModel,
    llmSettings.reasoningModel,
  ].filter((m): m is string => !!m && m.length > 0);
  const activeModel = modelOverride || llmSettings.chatModel;

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [aiMessages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // Stop any in-flight request on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Pick up prefill from selection-menu actions
  useEffect(() => {
    if (aiPrefill) {
      setInput(aiPrefill);
      setAiPrefill(null);
      // focus the textarea
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [aiPrefill, setAiPrefill]);

  const canSend = input.trim().length > 0 && !aiPending && !!activeModel;

  const send = async () => {
    if (!canSend) return;
    const userText = input.trim();
    setInput("");

    // Build the document context block. We embed it into the USER message
    // (not a separate system message) because many OpenAI-compatible
    // providers keep only the FIRST system message and drop the rest — which
    // silently lost the document. A user message is honored everywhere.
    let docCtx: string | null = null;
    if (contextMode === "doc" && activePath) {
      // Flush pending (debounced) editor edits, then read the freshest content.
      window.dispatchEvent(new Event("markflow:flush-editor"));
      const fresh = useStore.getState().openFiles.find((f) => f.path === activePath);
      if (fresh && fresh.content.trim()) {
        const trimmed = fresh.content.slice(0, 16000);
        const langNote = fresh.kind && fresh.kind !== "markdown" ? `（${fresh.kind} 文件）` : "";
        docCtx = `以下是当前文件「${fresh.name}」${langNote}的完整内容，请基于它回答我的问题：\n\n<document>\n${trimmed}\n</document>`;
      }
    }

    const sysMsg: ChatMessage = {
      role: "system",
      content:
        "你是 MarkFlow 内嵌的写作助手。回答简洁、直接。若提供了文档上下文，请严格基于文档内容作答；否则按通用知识作答。Markdown 输出。",
    };
    // What the user sees in the chat (clean), vs what we send to the API
    // (with the document prepended when context is on).
    const displayUser: ChatMessage = { role: "user", content: userText };
    const apiUser: ChatMessage = {
      role: "user",
      content: docCtx ? `${docCtx}\n\n---\n\n我的问题：${userText}` : userText,
    };
    const messages: ChatMessage[] = [sysMsg, ...aiMessages, apiUser];

    appendAiMessage(displayUser);
    appendAiMessage({ role: "assistant", content: "" });
    setAiPending(true);

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const stream = chatStream(llmSettings, messages, {
        model: activeModel,
        signal: ac.signal,
      });
      for await (const delta of stream) {
        updateLastAiMessage((prev) => prev + delta);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        updateLastAiMessage(
          (prev) => prev + `\n\n[错误] ${String(e?.message ?? e)}`,
        );
      }
    } finally {
      setAiPending(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const insertIntoEditor = (text: string) => {
    window.dispatchEvent(
      new CustomEvent("markflow:insert", {
        detail: { text, filePath: activePath ?? undefined },
      }),
    );
  };

  const notConfigured = !llmSettings.chatModel;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <span className="geek-label flex-1">ai</span>
        {modelOptions.length > 0 && (
          <select
            value={activeModel}
            onChange={(e) => setModelOverride(e.target.value)}
            className="text-[10.5px] bg-[color-mix(in_oklab,var(--color-text)_4%,transparent)] border border-[var(--glass-border,var(--color-border))] rounded-md px-2 py-0.5 text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_14%,transparent)] max-w-[120px] truncate"
            title="选择模型"
          >
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={clearAiMessages}
          disabled={aiMessages.length === 0 || aiPending}
          title="新对话"
          className="p-1 rounded-md hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] disabled:opacity-40"
        >
          <Plus size={12} strokeWidth={1.75} />
        </button>
      </div>

      {/* Context chips */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <span className="text-[10.5px] text-[var(--color-text-subtle)]">上下文</span>
        <ContextChip
          active={contextMode === "doc"}
          onClick={() => setContextMode(contextMode === "doc" ? "none" : "doc")}
          disabled={!activeFile}
          label={activeFile ? `当前文件 · ${activeFile.name}` : "当前文件"}
        />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
        {notConfigured && (
          <div className="mt-4 p-3 rounded-xl bg-[var(--md-amber-soft)] text-[12.5px] leading-relaxed">
            <div className="font-medium mb-1">尚未配置对话模型</div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
            >
              <SettingsIcon size={11} strokeWidth={1.75} />
              打开设置
            </button>
          </div>
        )}
        {!notConfigured && aiMessages.length === 0 && (
          <div className="mt-8 px-1">
            <div className="flex flex-col items-center text-center mb-4">
              <span className="ai-hero-icon"><Sparkles size={20} strokeWidth={1.75} /></span>
              <div className="text-[13px] font-medium text-[var(--color-text)] mt-2.5">和文档对话</div>
              <div className="text-[11.5px] text-[var(--color-text-subtle)] mt-1">
                {activeFile ? `已附带「${activeFile.name}」作为上下文` : "打开一个文件即可附带其内容作为上下文"}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {[
                "总结一下这篇文档",
                "用三个要点解释这段内容",
                "把这段翻译成英文",
              ].map((s) => (
                <button key={s} onClick={() => setInput(s)} className="ai-suggest">
                  <span className="ai-suggest-text">{s}</span>
                  <CornerDownLeft size={11} strokeWidth={1.75} className="ai-suggest-arrow" />
                </button>
              ))}
            </div>
          </div>
        )}
        {aiMessages.map((m, i) => (
          <Message
            key={i}
            message={m}
            streaming={aiPending && i === aiMessages.length - 1 && m.role === "assistant"}
            onCopy={() => copyText(m.content, i)}
            onInsert={() => insertIntoEditor(m.content)}
            canInsert={!!activeFile && activeFile.kind === "markdown"}
            copied={copiedIdx === i}
          />
        ))}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-[var(--glass-border,var(--color-border))]">
        <div className="cyber-input">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={notConfigured ? "请先在设置中配置模型" : "输入消息  (Enter 发送 · Shift+Enter 换行)"}
            disabled={notConfigured}
            rows={1}
            style={{ fontFamily: "var(--font-sans)" }}
            className="block w-full resize-none bg-transparent outline-none px-2.5 py-1.5 text-[13px] placeholder:text-[var(--color-text-subtle)]"
          />
          <div className="flex items-center justify-end gap-1 px-1.5 pb-1.5">
            {aiPending ? (
              <button
                onClick={stop}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg bg-[var(--color-bg-muted)] text-[var(--color-text)] hover:opacity-85"
              >
                <Square size={10} fill="currentColor" />
                停止
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!canSend}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg font-medium bg-[var(--color-accent)] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
              >
                发送
                <Send size={10} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextChip({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-[10.5px] px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? "bg-[var(--color-accent)] text-white border-transparent font-medium"
          : "bg-transparent border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}

function Message({
  message,
  streaming,
  onCopy,
  onInsert,
  canInsert,
  copied,
}: {
  message: ChatMessage;
  streaming: boolean;
  onCopy: () => void;
  onInsert: () => void;
  canInsert: boolean;
  copied: boolean;
}) {
  const isUser = message.role === "user";

  const html = useMemo(
    () => (isUser ? null : renderMarkdown(message.content)),
    [isUser, message.content],
  );

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`ai-avatar ${isUser ? "is-user" : "is-ai"}`}>
          {isUser ? <User size={11} strokeWidth={2} /> : <Sparkles size={11} strokeWidth={2} />}
        </span>
        <span className="text-[10.5px] uppercase tracking-wider text-[var(--color-text-subtle)] font-medium">
          {isUser ? "你" : "助手"}
        </span>
      </div>
      {isUser ? (
        <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap break-words rounded-2xl bg-[color-mix(in_oklab,var(--color-accent)_10%,var(--color-bg-muted))] px-3.5 py-2.5 text-[var(--color-text)] border border-[color-mix(in_oklab,var(--color-accent)_18%,transparent)]">
          {message.content}
        </div>
      ) : (
        <div className="ai-md text-[var(--color-text)] relative">
          {message.content.length === 0 && streaming ? (
            <span className="text-[12.5px] text-[var(--color-text-subtle)]">思考中…</span>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: html ?? "" }} />
          )}
          {streaming && message.content.length > 0 && (
            <span className="inline-block w-1.5 h-3 bg-[var(--color-accent)] align-text-bottom ml-0.5 animate-pulse" />
          )}
        </div>
      )}
      {!isUser && message.content.length > 0 && !streaming && (
        <div className="mt-1 flex items-center gap-0.5">
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
          >
            {copied ? <Check size={10} strokeWidth={2} /> : <Copy size={10} strokeWidth={1.75} />}
            {copied ? "已复制" : "复制"}
          </button>
          {canInsert && (
            <button
              onClick={onInsert}
              title="插入到当前文档光标处"
              className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg)]"
            >
              <CornerDownLeft size={10} strokeWidth={1.75} />
              插入
            </button>
          )}
        </div>
      )}
    </div>
  );
}
