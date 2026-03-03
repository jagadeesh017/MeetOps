import { useState, useContext, useRef, useEffect } from "react";
import { AuthContext } from "../context/Authcontext";

export default function AIScheduler({ onClose, onMeetingCreated }) {
  const { token } = useContext(AuthContext);
  const [messages, setMessages] = useState([
    {
      type: "bot",
      content: "Hi! I'm your AI Meeting Assistant. I can help you schedule meetings effortlessly. Just describe what you need, and I'll handle the details!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [
      ...prev,
      {
        type: "user",
        content: userMessage,
        timestamp: new Date(),
      },
    ]);

    if (!token) {
      setMessages((prev) => [
        ...prev,
        {
          type: "bot",
          content: "Authentication error - please login again",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    setLoading(true);

    try {
      const isDeleteIntent = /(delete|cancel|remove|drop|discard)/i.test(userMessage);
      const isFreshRequest = /\b(schedule|meeting|call|book)\b/i.test(userMessage) && userMessage.trim().split(/\s+/).length >= 4;
      const conversationHistory = messages
        .map((msg) => `${msg.type === "user" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n");
      const fullPrompt = (conversationHistory && !isFreshRequest) ? `${conversationHistory}\nUser: ${userMessage}` : userMessage;

      const response = await fetch(`http://localhost:5000/api/ai/${isDeleteIntent ? "delete-meeting" : "schedule-meeting"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          contextAware: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = data.message || data.error || (isDeleteIntent ? "Failed to delete" : "Failed to schedule");
        setMessages((prev) => [...prev, { type: "bot", content: msg.length < 100 ? msg : (isDeleteIntent ? "Failed to delete" : "Failed to schedule"), timestamp: new Date() }]);
        setLoading(false);
        return;
      }

      if (data.availableSlots) {
        const fmt = (s) => new Date(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        setMessages((prev) => [
          ...prev,
          {
            type: "bot",
            content: "Here are your next 4 available slots:",
            timestamp: new Date(),
            slots: data.availableSlots.map(fmt),
          },
        ]);
        setLoading(false);
        return;
      }

      if (data.deletedMeeting) {
        const deleted = data.deletedMeeting;
        setMessages((prev) => [
          ...prev,
          {
            type: "bot",
            content: `Done. I've cancelled "${deleted.title}" scheduled for ${new Date(deleted.startTime).toLocaleString()}.`,
            timestamp: new Date(),
          },
        ]);

        if (onMeetingCreated) {
          onMeetingCreated(deleted);
        }

        setLoading(false);
        return;
      }

      const meeting = data.meeting;
      if (meeting && meeting.title && meeting.startTime) {
        setMessages((prev) => [
          ...prev,
          {
            type: "bot",
            content: `Perfect! I've scheduled your meeting "${meeting.title}" for ${new Date(meeting.startTime).toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })} on ${meeting.platform}. Invitations have been sent to all attendees!`,
            timestamp: new Date(),
            meeting: meeting,
          },
        ]);

        if (onMeetingCreated) {
          onMeetingCreated(meeting);
        }
      }
      setLoading(false);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          type: "bot",
          content: `${err.message || "Something went wrong. Please try again."}`,
          timestamp: new Date(),
        },
      ]);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl h-[80vh] max-h-screen bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-white dark:bg-[#1f1f1f] px-6 py-4 flex justify-between items-center shrink-0 border-b border-gray-200 dark:border-[#3a3a3a]">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
              Meeting Assistant
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">Powered by AI</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-linear-to-b from-white to-gray-50 dark:from-[#252525] dark:to-[#1f1f1f] space-y-4 relative">
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${message.type === "user" ? "justify-end" : "justify-start"} animate-fadeIn`}
            >
              <div
                className={`max-w-xs lg:max-w-md xl:max-w-lg ${
                  message.type === "user"
                    ? "bg-blue-600 hover:bg-blue-700 text-white rounded-3xl rounded-tr-sm px-5 py-3 shadow-md transition"
                    : "bg-gray-100 dark:bg-[#333333] text-gray-900 dark:text-gray-50 rounded-3xl rounded-tl-sm px-5 py-3 shadow-sm"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                {message.slots && (
                  <div className="mt-3 space-y-2">
                    {message.slots.map((slot, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 text-sm font-medium">
                        <span className="w-5 h-5 flex items-center justify-center bg-white/20 rounded-full text-xs font-bold shrink-0">{i + 1}</span>
                        {slot}
                      </div>
                    ))}
                  </div>
                )}
                {message.meeting && (
                  <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                      <p className="text-xs opacity-75 mb-1">Title</p>
                      <p className="font-semibold text-sm">{message.meeting.title}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2">
                        <p className="text-xs opacity-75 mb-1">Platform</p>
                        <p className="font-semibold text-sm capitalize">{message.meeting.platform}</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2">
                        <p className="text-xs opacity-75 mb-1">Duration</p>
                        <p className="font-semibold text-sm">{message.meeting.duration} min</p>
                      </div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2">
                      <p className="text-xs opacity-75 mb-1">When</p>
                      <p className="font-semibold text-sm">
                        {new Date(message.meeting.startTime).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2">
                      <p className="text-xs opacity-75 mb-2">Attendees</p>
                      <div className="flex flex-wrap gap-1">
                        {message.meeting.attendees.map((attendee, i) => (
                          <span key={i} className="text-xs bg-white/20 rounded-full px-2 py-1">
                            {attendee.split('@')[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                    {message.meeting.meetingLink && (
                      <a
                        href={message.meeting.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-2 transition-colors mt-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4m-4-6l6 6m0 0l-6 6m6-6H3" />
                        </svg>
                        Join Meeting
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-[#333333] rounded-3xl rounded-tl-sm px-5 py-3 flex gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 bg-white dark:bg-[#2a2a2a] border-t border-gray-200 dark:border-[#3a3a3a] p-4">
          <form onSubmit={handleSendMessage} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex: 45-min project discussion tomorrow at 11 AM on Google Meet"
              disabled={loading}
              className="flex-1 bg-gray-100 dark:bg-[#3a3a3a] text-gray-900 dark:text-white rounded-full px-5 py-3 text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-[#404040] transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-full p-3 transition-all duration-200 disabled:cursor-not-allowed shrink-0"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5.951-1.429 5.951 1.429a1 1 0 001.169-1.409l-7-14z" />
                </svg>
              )}
            </button>
          </form>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            Tip: No need for perfect formatting — just describe it. AI will figure it out.          
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
