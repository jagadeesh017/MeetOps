import { useState, useRef, useEffect } from "react";
import api from "../services/api";

const cleanContent = (text = "") =>
  text
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/ACTION:\s*\{[\s\S]*$/i, "")
    .trim();

const getPlatformMeta = (platform) => {
  const p = String(platform || "").toLowerCase();
  if (p === "zoom") return { label: "Zoom", badge: "Z", style: "bg-sky-500/15 text-sky-300 border-sky-400/40" };
  if (p === "google" || p === "meet") return { label: "Google Meet", badge: "G", style: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40" };
  return { label: "Meeting", badge: "M", style: "bg-slate-500/15 text-slate-300 border-slate-400/40" };
};

const BotAvatar = () => (
  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  </div>
);

const UserAvatar = () => (
  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shrink-0 shadow-md">
    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  </div>
);

const TypingIndicator = () => (
  <div className="flex items-end gap-2.5 justify-start" style={{ animation: "mbFadeIn 0.2s ease-out" }}>
    <BotAvatar />
    <div className="bg-white dark:bg-[#1e1e2e] border border-gray-100 dark:border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-2">
      <span className="text-xs text-gray-400 dark:text-gray-500">MeetBot is thinking</span>
      <span className="flex gap-1 ml-0.5">
        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "160ms" }} />
        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "320ms" }} />
      </span>
    </div>
  </div>
);

const MeetingCard = ({ meeting }) => {
  if (!meeting) return null;
  const platform = getPlatformMeta(meeting.platform);
  return (
    <div className="mt-2.5 rounded-xl overflow-hidden border border-white/20 text-sm bg-gradient-to-br from-white/10 to-white/[0.03]">
      <div className="px-3 py-2 font-semibold flex items-center justify-between gap-2 text-xs border-b border-white/10">
        <div className="flex items-center gap-1.5 min-w-0">
        <span>📅</span>
        <span className="truncate">{meeting.title}</span>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${platform.style}`}>
          <span className="w-4 h-4 rounded-full bg-white/20 inline-flex items-center justify-center text-[9px]">{platform.badge}</span>
          {platform.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/10">
        <div className="bg-white/5 px-3 py-2">
          <p className="text-xs opacity-50 mb-0.5">When</p>
          <p className="font-medium text-xs leading-snug">
            {new Date(meeting.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            <br />
            {new Date(meeting.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="bg-white/5 px-3 py-2">
          <p className="text-xs opacity-50 mb-0.5">Platform</p>
          <p className="font-medium text-xs capitalize">{platform.label}</p>
          {meeting.duration && <p className="text-xs opacity-50">{meeting.duration} min</p>}
        </div>
      </div>
      {meeting.attendees?.length > 0 && (
        <div className="bg-white/5 px-3 py-2">
          <p className="text-xs opacity-50 mb-1">Attendees</p>
          <div className="flex flex-wrap gap-1">
            {meeting.attendees.slice(0, 6).map((a, i) => (
              <span key={i} className="text-xs bg-white/20 rounded-full px-2 py-0.5">
                {typeof a === "string" ? a.split("@")[0] : a.name || a.email?.split("@")[0] || "—"}
              </span>
            ))}
          </div>
        </div>
      )}
      {meeting.joinUrl && (
        <a
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 transition text-xs font-medium"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4m-4-6l6 6m0 0l-6 6m6-6H3" />
          </svg>
          Join Meeting
        </a>
      )}
    </div>
  );
};

const SlotList = ({ slots }) => (
  <div className="mt-2.5 space-y-1.5">
    {slots.map((s, i) => (
      <div key={i} className="flex items-center gap-2.5 bg-white/10 rounded-xl px-3 py-2 text-xs font-medium">
        <span className="w-5 h-5 flex items-center justify-center bg-white/25 rounded-full text-xs font-bold shrink-0">
          {i + 1}
        </span>
        {s.formatted || s.time || s}
      </div>
    ))}
  </div>
);

const MeetingList = ({ meetings }) => (
  <div className="mt-2.5 space-y-1.5">
    {meetings.slice(0, 5).map((m, i) => (
      <div key={i} className="flex items-start gap-2.5 bg-white/10 rounded-xl px-3 py-2.5 text-xs">
        <span className="font-bold w-4 shrink-0 opacity-60 mt-0.5">{i + 1}.</span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight truncate">{m.title}</p>
          <p className="opacity-60 mt-0.5">
            {new Date(m.startTime).toLocaleString("en-US", {
              weekday: "short", month: "short", day: "numeric", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    ))}
  </div>
);

const MessageBubble = ({ message }) => {
  const isUser = message.type === "user";
  const content = cleanContent(message.content || "");

  return (
    <div
      className={`flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
      style={{ animation: "mbFadeIn 0.22s ease-out" }}
    >
      {!isUser && <BotAvatar />}

      <div
        className={`max-w-[78%] ${
          isUser
            ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl rounded-br-sm shadow-md shadow-violet-900/30"
            : "bg-white dark:bg-[#1e1e2e] text-gray-900 dark:text-gray-100 rounded-2xl rounded-bl-sm shadow-sm border border-gray-100 dark:border-white/8"
        } px-4 py-3`}
      >
        {content && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        )}

        {message.meeting && <MeetingCard meeting={message.meeting} />}
        {message.slots?.length > 0 && <SlotList slots={message.slots} />}
        {message.meetings?.length > 0 && <MeetingList meetings={message.meetings} />}

        <p className={`text-xs mt-2 opacity-35 ${isUser ? "text-right" : ""}`}>
          {new Date(message.timestamp || Date.now()).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {isUser && <UserAvatar />}
    </div>
  );
};

const QUICK_PROMPTS = [
  { icon: "📅", label: "Meetings today",    text: "What meetings do I have today?" },
  { icon: "⏭️", label: "Next meeting",      text: "When is my next meeting?" },
  { icon: "🕐", label: "Find free slots",   text: "Find my next available time slots" },
  { icon: "📋", label: "All upcoming",      text: "List all my upcoming meetings" },
  { icon: "✅", label: "Schedule meeting",  text: "Schedule a meeting" },
  { icon: "🗑️", label: "Cancel meeting",   text: "Cancel a meeting" },
];

export default function AIScheduler({ onClose, onMeetingCreated }) {
  const [messages, setMessages] = useState([
    {
      type: "bot",
      content:
        "Hey! 👋 I'm MeetBot, your AI meeting assistant.\n\nI have full access to your calendar. Ask me to schedule, reschedule, cancel, or check your meetings — just type naturally!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const sendMessage = async (textOverride) => {
    const messageText = typeof textOverride === "string" ? textOverride : input.trim();
    if (!messageText || loading) return;

    const historySnapshot = [...messages];
    const userMsg = { type: "user", content: messageText, timestamp: new Date() };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    resetTextareaHeight();
    setLoading(true);

    try {
      const res = await api.post("/api/ai/chat", {
        prompt: messageText,
        conversationHistory: historySnapshot,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      const data = res.data;

      if (data.success) {
        const rawText = data.reply || data.message || "";
        const botContent = cleanContent(rawText) || "Done! Is there anything else?";

        const botMsg = {
          type: "bot",
          content: botContent,
          timestamp: new Date(),
          meeting: data.meeting || null,
          slots: data.slots?.length ? data.slots : null,
          meetings: data.meetings?.length ? data.meetings : null,
        };

        setMessages((prev) => [...prev, botMsg]);

        if (data.meeting && onMeetingCreated) {
          onMeetingCreated(data.meeting);
        }
      } else {
        const friendlyMsg =
          data.code === "rate_limit"
            ? "I'm a little busy right now. Please try again in a moment."
            : "Something went wrong on my end. Please try again.";
        setMessages((prev) => [
          ...prev,
          { type: "bot", content: friendlyMsg, timestamp: new Date() },
        ]);
      }
    } catch (error) {
      const code = error?.response?.data?.code;
      const friendlyMsg =
        code === "rate_limit"
          ? "I'm a little busy right now. Please try again in a moment."
          : "Sorry, I couldn't reach the server. Please check your connection and try again.";
      setMessages((prev) => [
        ...prev,
        { type: "bot", content: friendlyMsg, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleTextareaChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const showQuickPrompts = messages.length === 1 && !loading;

  return (
    <>
      <style>{`
        @keyframes mbFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mb-scroll::-webkit-scrollbar { width: 4px; }
        .mb-scroll::-webkit-scrollbar-track { background: transparent; }
        .mb-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 99px; }
        .mb-textarea { resize: none; outline: none; overflow: hidden; }
      `}</style>

      <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[1px] p-2 sm:p-4 flex items-end sm:items-center sm:justify-end">
      <div className="relative flex flex-col w-full sm:w-[430px] h-[78vh] sm:h-[86vh] max-h-[760px] overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#15192b] via-[#12172a] to-[#0f1425] shadow-2xl shadow-black/50">

        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#11172a] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm leading-none">MeetBot</h2>
              <p className="text-cyan-200/85 text-xs mt-0.5">Scheduling Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-400/25 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-lg"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3 mb-scroll">
          {messages.map((msg, idx) => (
            <MessageBubble key={idx} message={msg} />
          ))}
          {loading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {showQuickPrompts && (
          <div className="px-3.5 pb-2.5 shrink-0" style={{ animation: "mbFadeIn 0.3s ease-out" }}>
            <p className="text-xs text-gray-500 mb-2 px-0.5 font-medium tracking-wide uppercase">
              Quick actions
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q.text)}
                  className="flex items-center gap-2 text-left text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/45 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all duration-150"
                >
                  <span className="shrink-0">{q.icon}</span>
                  <span className="truncate">{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 px-3.5 pb-3.5 pt-2.5 border-t border-white/10 bg-[#11172a]">
          <div className="flex items-end gap-2 bg-white/8 border border-white/12 hover:border-white/20 focus-within:border-cyan-500/45 focus-within:bg-white/10 rounded-2xl px-3.5 py-2.5 transition-all duration-200">
            <textarea
              ref={(el) => {
                inputRef.current = el;
                textareaRef.current = el;
              }}
              value={input}
              rows={1}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask me about your meetings…"
              disabled={loading}
              className="mb-textarea flex-1 bg-transparent text-sm text-white placeholder-gray-400 leading-relaxed py-0.5 disabled:opacity-50 min-h-[22px] w-full"
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-40 text-white transition-all duration-200 shadow-sm hover:shadow-cyan-500/30 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1.5 text-center select-none">
            Enter to send · Shift+Enter for new line
          </p>
        </div>

      </div>
      </div>
    </>
  );
}
