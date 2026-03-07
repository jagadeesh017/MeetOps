import { useState, useCallback, useContext, useEffect } from 'react';
import { AuthContext } from '../context/Authcontext';
import { deleteMeeting, getMeetings } from '../services/api';
import { getTimezoneList, getLocalTimezone } from '../utils/calendarUtils';
import ScheduleMeeting from './ScheduleMeeting';
import { useToast } from '../context/ToastContext';

const getPartsInTZ = (dateInput, tz) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(dateInput));
    const v = (t) => parseInt(parts.find(p => p.type === t)?.value ?? '0');
    return { year: v('year'), month: v('month') - 1, day: v('day'), hour: v('hour') % 24, minute: v('minute') };
};

const PLATFORM_CONFIG = {
    zoom: { label: 'Zoom', short: 'Z', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', accent: '#2D8CFF' },
    meet: { label: 'Google Meet', short: 'G', color: 'bg-green-100 text-green-700', dot: 'bg-green-500', accent: '#34A853' },
    google: { label: 'Google Meet', short: 'G', color: 'bg-green-100 text-green-700', dot: 'bg-green-500', accent: '#34A853' },
    teams: { label: 'Teams', short: 'T', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500', accent: '#6264a7' },
    other: { label: 'Other', short: 'M', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400', accent: '#6264a7' },
};

function getPlatformStyle(platform) {
    const colors = {
        zoom: {
            bg: '#2D8CFF',
            border: '#1a6fd4',
            text: '#ffffff',
            pattern: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.07) 6px, rgba(255,255,255,0.02) 6px, rgba(255,255,255,0.02) 12px)',
            badgeBg: 'rgba(9, 62, 120, 0.55)',
        },
        meet: {
            bg: '#34A853',
            border: '#1e7e34',
            text: '#ffffff',
            pattern: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.09) 6px, rgba(255,255,255,0.025) 6px, rgba(255,255,255,0.025) 12px)',
            badgeBg: 'rgba(18, 85, 38, 0.55)',
        },
        google: {
            bg: '#34A853',
            border: '#1e7e34',
            text: '#ffffff',
            pattern: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.09) 6px, rgba(255,255,255,0.025) 6px, rgba(255,255,255,0.025) 12px)',
            badgeBg: 'rgba(18, 85, 38, 0.55)',
        },
        teams: {
            bg: '#6264a7',
            border: '#4a4c8a',
            text: '#ffffff',
            pattern: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.07) 6px, rgba(255,255,255,0.02) 6px, rgba(255,255,255,0.02) 12px)',
            badgeBg: 'rgba(37, 41, 89, 0.55)',
        },
        other: {
            bg: '#6b7280',
            border: '#4b5563',
            text: '#ffffff',
            pattern: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.07) 6px, rgba(255,255,255,0.02) 6px, rgba(255,255,255,0.02) 12px)',
            badgeBg: 'rgba(43, 51, 67, 0.55)',
        },
    };
    return colors[platform] ?? colors.other;
}

function EventDetailModal({ meeting, onClose, onDelete, onEdit, canDelete, deleting, timezone }) {
    if (!meeting) return null;
    const platform = meeting.platform || 'other';
    const cfg = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.other;
    const attendees = meeting.attendees || [];
    const isCancelled = meeting.status === 'cancelled';
    const isCompleted = new Date(meeting.endTime) < new Date();
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    const fmt = (d) => new Date(d).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: tz,
    });
    const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="h-1.5 w-full" style={{ background: cfg.accent }} />

                <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                            <h2 className={`text-lg font-semibold leading-snug ${isCancelled ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                                {meeting.title}
                            </h2>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${isCompleted ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400' : cfg.color}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-gray-400' : cfg.dot}`} />
                                    {cfg.label}
                                </span>
                                {isCancelled && (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                        Cancelled
                                    </span>
                                )}
                                {isCompleted && !isCancelled && (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        Completed
                                    </span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none mt-0.5 flex-shrink-0"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                        <span>🕐</span>
                        <span>
                            {fmt(meeting.startTime)} – {fmtTime(meeting.endTime)}
                            {isCancelled && <span className="ml-2 text-xs text-red-600 dark:text-red-300 font-medium">(Cancelled)</span>}
                        </span>
                    </div>

                    {meeting.organizerEmail && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <span>👤</span>
                            <span><strong>Organizer:</strong> {meeting.organizerEmail}</span>
                        </div>
                    )}

                    {attendees.length > 0 && (
                        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <span className="mt-0.5">👥</span>
                            <div><strong>Attendees:</strong> {attendees.map(a => a.name || a.email).join(', ')}</div>
                        </div>
                    )}

                    {meeting.description && (
                        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                            <span className="mt-0.5">📝</span>
                            <span>{meeting.description}</span>
                        </div>
                    )}

                    <div className="border-t border-gray-200 dark:border-gray-600 my-4" />

                    <div className="flex items-center gap-3">
                        {meeting.joinUrl && !isCancelled && !isCompleted ? (
                            <a
                                href={meeting.joinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-semibold text-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2"
                                style={{ background: cfg.accent }}
                            >
                                Join
                            </a>
                        ) : (
                            <div className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 text-sm">
                                {isCancelled ? 'This meeting has been cancelled' : isCompleted ? 'This meeting has ended' : 'No join link available'}
                            </div>
                        )}
                        {canDelete && !isCancelled && !isCompleted && (
                            <>
                                <button
                                    onClick={() => onEdit(meeting)}
                                    className="px-4 py-2.5 rounded-lg border border-blue-200 dark:border-blue-900/40 text-blue-600 dark:text-blue-300 text-sm font-semibold bg-blue-50/70 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => onDelete(meeting)}
                                    disabled={deleting}
                                    className="px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-300 text-sm font-semibold bg-red-50/70 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {deleting ? 'Cancelling...' : 'Cancel meeting'}
                                </button>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium bg-white/70 dark:bg-[#2f2f2f] hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CustomCalendar() {
    const { user } = useContext(AuthContext);
    const [view, setView] = useState('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timezone, setTimezone] = useState(user?.settings?.timezone || getLocalTimezone() || 'Asia/Kolkata');
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [editingMeeting, setEditingMeeting] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const { showToast } = useToast();

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 30000);

        return () => clearInterval(timer);
    }, []);

    const timezones = getTimezoneList();
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const fetchMeetings = useCallback(async () => {
        if (!user?.email) return;
        try {
            setLoading(true);
            const data = await getMeetings(user.email);
            setMeetings(data);
        } catch (err) {
            console.error('Error fetching meetings:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchMeetings();
    }, [fetchMeetings]);

    useEffect(() => {
        if (user?.settings?.timezone) setTimezone(user.settings.timezone);
    }, [user?.settings?.timezone]);

    const getWeekDays = () => {
        const start = new Date(currentDate);
        start.setDate(start.getDate() - start.getDay());
        return Array.from({ length: 7 }, (_, i) => {
            const day = new Date(start);
            day.setDate(start.getDate() + i);
            return day;
        });
    };

    const getMonthDays = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - startDate.getDay());

        const days = [];
        const current = new Date(startDate);

        for (let i = 0; i < 42; i++) {
            days.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }

        return days;
    };

    const formatTime = (hour) => {
        if (hour === 0) return '12 AM';
        if (hour === 12) return '12 PM';
        return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
    };

    const handlePrevious = () => {
        const newDate = new Date(currentDate);
        if (view === 'week') {
            newDate.setDate(newDate.getDate() - 7);
        } else if (view === 'day') {
            newDate.setDate(newDate.getDate() - 1);
        } else {
            newDate.setMonth(newDate.getMonth() - 1);
        }
        setCurrentDate(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(currentDate);
        if (view === 'week') {
            newDate.setDate(newDate.getDate() + 7);
        } else if (view === 'day') {
            newDate.setDate(newDate.getDate() + 1);
        } else {
            newDate.setMonth(newDate.getMonth() + 1);
        }
        setCurrentDate(newDate);
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const handleSlotClick = (day, hour) => {
        const y = day.getFullYear();
        const m = String(day.getMonth() + 1).padStart(2, '0');
        const d = String(day.getDate()).padStart(2, '0');
        const h = String(hour).padStart(2, '0');

        const dateStr = `${y}-${m}-${d}T${h}:00:00`;
        setSelectedSlot({ date: dateStr, timezone });
        setShowScheduleForm(true);
    };

    const handleEditMeeting = (meeting) => {
        setSelectedMeeting(null);
        setEditingMeeting(meeting);
    };

    const handleDeleteMeeting = async (meeting) => {
        if (!meeting?._id) return;
        setDeleting(true);
        try {
            await deleteMeeting(meeting._id);
            setSelectedMeeting(null);
            await fetchMeetings();
            showToast('Meeting cancelled successfully', 'success');
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Unknown error';
            showToast('Failed to cancel meeting: ' + msg, 'error');
        } finally {
            setDeleting(false);
        }
    };

    const getMeetingsForDay = (day) => {
        const y = day.getFullYear(), m = day.getMonth(), d = day.getDate();
        return meetings.filter(meeting => {
            const p = getPartsInTZ(meeting.startTime, timezone);
            return p.year === y && p.month === m && p.day === d;
        });
    };

    const calculateMeetingPosition = (meeting, slotHeight) => {
        const start = getPartsInTZ(meeting.startTime, timezone);
        const startOffset = (start.minute / 60) * slotHeight;
        const totalMinutes = Math.max(1, Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / 60000));
        const height = (totalMinutes / 60) * slotHeight;
        return {
            top: start.hour * slotHeight + startOffset,
            height: Math.max(height, 20),
        };
    };

    const layoutOverlappingMeetings = (dayMeetings, slotHeight) => {
        if (!dayMeetings.length) return [];

        const items = dayMeetings.map((m, origIdx) => ({
            origIdx,
            pos: calculateMeetingPosition(m, slotHeight),
            col: 0,
            totalCols: 1,
        })).sort((a, b) => a.pos.top - b.pos.top);

        const overlaps = (a, b) =>
            a.pos.top < b.pos.top + b.pos.height && b.pos.top < a.pos.top + a.pos.height;

        const clusters = [];
        items.forEach(item => {
            const existing = clusters.find(c => c.some(x => overlaps(x, item)));
            existing ? existing.push(item) : clusters.push([item]);
        });

        clusters.forEach(cluster => {
            const colEnds = [];
            cluster.forEach(item => {
                let col = colEnds.findIndex(end => item.pos.top >= end);
                if (col === -1) { col = colEnds.length; colEnds.push(0); }
                colEnds[col] = item.pos.top + item.pos.height;
                item.col = col;
            });
            cluster.forEach(item => { item.totalCols = colEnds.length; });
        });

        const result = new Array(dayMeetings.length);
        items.forEach(item => { result[item.origIdx] = { col: item.col, totalCols: item.totalCols }; });
        return result;
    };

    const renderWeekView = () => {
        const weekDays = getWeekDays();
        const slotHeight = 48;
        const todayParts = getPartsInTZ(new Date(), timezone);

        return (
            <div className="flex flex-col h-full">
                <div className="flex border-b border-gray-200 dark:border-[#4a4a4a] bg-white dark:bg-[#3d3d3d]">
                    <div className="w-16 flex-shrink-0"></div>
                    {weekDays.map((day, idx) => (
                        <div
                            key={idx}
                            className="flex-1 text-center py-2 border-l border-gray-200 dark:border-[#4a4a4a]"
                        >
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                {day.toLocaleDateString('en-US', { weekday: 'short' })}
                            </div>
                            <div className={`text-lg font-semibold ${day.getFullYear() === todayParts.year && day.getMonth() === todayParts.month && day.getDate() === todayParts.day
                                ? 'text-blue-600 dark:text-[#6264a7]'
                                : 'text-gray-900 dark:text-gray-100'
                                }`}>
                                {day.getDate()}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="flex relative">
                        <div className="w-16 flex-shrink-0 bg-white dark:bg-[#3d3d3d]">
                            {hours.map(hour => (
                                <div key={hour} className="h-12 text-xs text-gray-500 dark:text-gray-400 pr-2 text-right pt-1">
                                    {formatTime(hour)}
                                </div>
                            ))}
                        </div>

                        {weekDays.map((day, dayIdx) => {
                            const dayMeetings = getMeetingsForDay(day);
                            const overlapLayout = layoutOverlappingMeetings(dayMeetings, slotHeight);

                            return (
                                <div key={dayIdx} className="flex-1 border-l border-gray-200 dark:border-[#4a4a4a] relative">
                                    {hours.map(hour => (
                                        <div
                                            key={hour}
                                            onClick={() => handleSlotClick(day, hour)}
                                            className="h-12 border-t border-gray-100 dark:border-[#3d3d3d] hover:bg-gray-50 dark:hover:bg-[#333333] cursor-pointer bg-white dark:bg-[#292929]"
                                        />
                                    ))}

                                    {dayMeetings.map((meeting, idx) => {
                                        const pos = calculateMeetingPosition(meeting, slotHeight);
                                        const { col, totalCols } = overlapLayout[idx];
                                        const ps = getPlatformStyle(meeting.platform);
                                        const platformMeta = PLATFORM_CONFIG[meeting.platform] || PLATFORM_CONFIG.other;
                                        const isCancelled = meeting.status === 'cancelled';
                                        const isCompleted = !isCancelled && new Date(meeting.endTime) < new Date();
                                        const colW = 100 / totalCols;
                                        const leftPct = col * colW;
                                        return (
                                            <div
                                                key={idx}
                                                className="absolute rounded px-1 py-0.5 text-xs overflow-hidden cursor-pointer transition"
                                                style={{
                                                    top: `${pos.top}px`,
                                                    height: `${pos.height}px`,
                                                    left: `calc(${leftPct}% + 1px)`,
                                                    width: `calc(${colW}% - 2px)`,
                                                    backgroundColor: isCancelled ? 'transparent' : isCompleted ? `color-mix(in srgb, ${ps.bg} 60%, transparent)` : ps.bg,
                                                    borderLeft: isCancelled ? '3px dashed #9ca3af' : isCompleted ? `4px solid color-mix(in srgb, ${ps.border} 50%, #9ca3af)` : `4px solid ${ps.border}`,
                                                    border: isCancelled ? '1px dashed #9ca3af' : undefined,
                                                    color: isCancelled ? '#9ca3af' : isCompleted ? `color-mix(in srgb, ${ps.text} 60%, #9ca3af)` : ps.text,
                                                    opacity: isCancelled ? 0.4 : 1,
                                                    filter: isCancelled ? 'grayscale(1)' : isCompleted ? 'saturate(0.4)' : 'none',
                                                    backgroundImage: isCompleted ? 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(156,163,175,0.1) 4px, rgba(156,163,175,0.1) 6px)' : ps.pattern,
                                                    zIndex: 10 + col,
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedMeeting(meeting);
                                                }}
                                            >
                                                {!isCancelled && (
                                                    <span
                                                        title={platformMeta.label}
                                                        className="absolute right-1 top-1 text-[9px] font-bold px-1.5 py-0.5 rounded"
                                                        style={{ backgroundColor: ps.badgeBg, color: '#fff' }}
                                                    >
                                                        {platformMeta.short}
                                                    </span>
                                                )}
                                                <div className={`font-medium truncate flex items-center gap-1 ${isCancelled ? 'line-through' : ''}`}>
                                                    {meeting.isRecurring && <span title="Recurring meeting">🔄</span>}
                                                    {isCancelled && <span title="Cancelled" className="text-[11px]">✕</span>}
                                                    {isCompleted && <span title="Completed" className="text-[11px]">✓</span>}
                                                    {meeting.title}
                                                </div>
                                                {pos.height > 30 && (
                                                    <div className="text-[10px] opacity-75">
                                                        {new Date(meeting.startTime).toLocaleTimeString('en-US', {
                                                            hour: 'numeric',
                                                            minute: '2-digit',
                                                            timeZone: timezone,
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderDayView = () => {
        const slotHeight = 64;
        const dayMeetings = getMeetingsForDay(currentDate);
        const tzNow = getPartsInTZ(currentTime, timezone);
        const isToday = currentDate.getFullYear() === tzNow.year && currentDate.getMonth() === tzNow.month && currentDate.getDate() === tzNow.day;
        const timeIndicatorPos = isToday
            ? ((tzNow.hour * 60 + tzNow.minute) / (24 * 60)) * (24 * slotHeight)
            : null;

        return (
            <div className="flex flex-col h-full">
                <div className="flex border-b border-gray-200 dark:border-[#4a4a4a] bg-white dark:bg-[#3d3d3d]">
                    <div className="w-16 flex-shrink-0"></div>
                    <div className="flex-1 text-center py-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
                        </div>
                        <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                            {currentDate.getDate()}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="flex relative">
                        <div className="w-16 flex-shrink-0 bg-white dark:bg-[#3d3d3d]">
                            {hours.map(hour => (
                                <div key={hour} className="h-16 text-xs text-gray-500 dark:text-gray-400 pr-2 text-right pt-1">
                                    {formatTime(hour)}
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 border-l border-gray-200 dark:border-[#4a4a4a] relative">
                            {isToday && timeIndicatorPos !== null && (
                                <div
                                    className="absolute left-0 right-0 z-30 flex items-center pointer-events-none"
                                    style={{ top: `${timeIndicatorPos}px` }}
                                >
                                    <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg border-2 border-white dark:border-[#292929]"></div>
                                    <div className="flex-1 h-0.5 bg-gradient-to-r from-red-500 to-transparent"></div>
                                </div>
                            )}

                            {hours.map(hour => (
                                <div
                                    key={hour}
                                    onClick={() => handleSlotClick(currentDate, hour)}
                                    className="h-16 border-t border-gray-100 dark:border-[#3d3d3d] hover:bg-gray-50 dark:hover:bg-[#333333] cursor-pointer bg-white dark:bg-[#292929]"
                                />
                            ))}

                            {(() => {
                                const overlapLayout = layoutOverlappingMeetings(dayMeetings, slotHeight);
                                return dayMeetings.map((meeting, idx) => {
                                    const pos = calculateMeetingPosition(meeting, slotHeight);
                                    const { col, totalCols } = overlapLayout[idx];
                                    const ps = getPlatformStyle(meeting.platform);
                                    const platformMeta = PLATFORM_CONFIG[meeting.platform] || PLATFORM_CONFIG.other;
                                    const isCancelled = meeting.status === 'cancelled';
                                    const isCompleted = !isCancelled && new Date(meeting.endTime) < new Date();
                                    const colW = 100 / totalCols;
                                    const leftPct = col * colW;
                                    return (
                                        <div
                                            key={idx}
                                            className="absolute rounded px-2 py-1 overflow-hidden cursor-pointer transition"
                                            style={{
                                                top: `${pos.top}px`,
                                                height: `${pos.height}px`,
                                                left: `calc(${leftPct}% + 2px)`,
                                                width: `calc(${colW}% - 4px)`,
                                                backgroundColor: isCancelled ? 'transparent' : isCompleted ? `color-mix(in srgb, ${ps.bg} 60%, transparent)` : ps.bg,
                                                borderLeft: isCancelled ? '3px dashed #9ca3af' : isCompleted ? `4px solid color-mix(in srgb, ${ps.border} 50%, #9ca3af)` : `4px solid ${ps.border}`,
                                                border: isCancelled ? '1px dashed #9ca3af' : undefined,
                                                color: isCancelled ? '#9ca3af' : isCompleted ? `color-mix(in srgb, ${ps.text} 60%, #9ca3af)` : ps.text,
                                                opacity: isCancelled ? 0.4 : 1,
                                                filter: isCancelled ? 'grayscale(1)' : isCompleted ? 'saturate(0.4)' : 'none',
                                                backgroundImage: isCompleted ? 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(156,163,175,0.1) 4px, rgba(156,163,175,0.1) 6px)' : ps.pattern,
                                                zIndex: 10 + col,
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedMeeting(meeting);
                                            }}
                                        >
                                            {!isCancelled && (
                                                <span
                                                    title={platformMeta.label}
                                                    className="absolute right-1.5 top-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                    style={{ backgroundColor: ps.badgeBg, color: '#fff' }}
                                                >
                                                    {platformMeta.short}
                                                </span>
                                            )}
                                            <div className={`font-semibold truncate flex items-center gap-1 ${isCancelled ? 'line-through' : ''}`}>
                                                {meeting.isRecurring && <span title="Recurring meeting">🔄</span>}
                                                {isCancelled && <span title="Cancelled" className="text-[11px]">✕</span>}
                                                {isCompleted && <span title="Completed" className="text-[11px]">✓</span>}
                                                {meeting.title}
                                            </div>
                                            <div className="text-xs opacity-75">
                                                {new Date(meeting.startTime).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    timeZone: timezone,
                                                })} – {new Date(meeting.endTime).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    timeZone: timezone,
                                                })}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderMonthView = () => {
        const monthDays = getMonthDays();
        const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayParts = getPartsInTZ(new Date(), timezone);

        return (
            <div className="flex flex-col h-full">
                <div className="grid grid-cols-7 border-b border-gray-200 dark:border-[#4a4a4a] bg-white dark:bg-[#3d3d3d]">
                    {weekDays.map(day => (
                        <div key={day} className="text-center py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="flex-1 grid grid-cols-7 grid-rows-6">
                    {monthDays.map((day, idx) => {
                        const dayMeetings = getMeetingsForDay(day);
                        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                        const isToday = day.getFullYear() === todayParts.year && day.getMonth() === todayParts.month && day.getDate() === todayParts.day;

                        return (
                            <div
                                key={idx}
                                className={`border-r border-b border-gray-200 dark:border-[#3d3d3d] p-2 ${isCurrentMonth
                                    ? 'bg-white dark:bg-[#292929]'
                                    : 'bg-gray-50 dark:bg-[#1f1f1f]'
                                    } hover:bg-gray-50 dark:hover:bg-[#333333] cursor-pointer overflow-hidden`}
                                onClick={() => {
                                    setCurrentDate(day);
                                    setView('day');
                                }}
                            >
                                <div className={`text-sm font-medium mb-1 ${isToday
                                    ? 'bg-blue-600 dark:bg-[#6264a7] text-white rounded-full w-6 h-6 flex items-center justify-center'
                                    : isCurrentMonth
                                        ? 'text-gray-900 dark:text-gray-100'
                                        : 'text-gray-400 dark:text-gray-600'
                                    }`}>
                                    {day.getDate()}
                                </div>

                                <div className="space-y-1">
                                    {dayMeetings.slice(0, 3).map((meeting, mIdx) => {
                                        const ps = getPlatformStyle(meeting.platform);
                                        const platformMeta = PLATFORM_CONFIG[meeting.platform] || PLATFORM_CONFIG.other;
                                        const isCancelled = meeting.status === 'cancelled';
                                        const isCompleted = !isCancelled && new Date(meeting.endTime) < new Date();
                                        return (
                                            <div
                                                key={mIdx}
                                                className="text-xs px-1 py-0.5 rounded truncate cursor-pointer transition"
                                                style={{
                                                    backgroundColor: isCancelled ? 'transparent' : isCompleted ? `color-mix(in srgb, ${ps.bg} 60%, transparent)` : ps.bg,
                                                    borderLeft: isCancelled ? '2px dashed #9ca3af' : isCompleted ? `3px solid color-mix(in srgb, ${ps.border} 50%, #9ca3af)` : `3px solid ${ps.border}`,
                                                    border: isCancelled ? '1px dashed #9ca3af' : undefined,
                                                    color: isCancelled ? '#9ca3af' : isCompleted ? `color-mix(in srgb, ${ps.text} 60%, #9ca3af)` : ps.text,
                                                    opacity: isCancelled ? 0.4 : 1,
                                                    filter: isCancelled ? 'grayscale(1)' : isCompleted ? 'saturate(0.4)' : 'none',
                                                    backgroundImage: isCompleted ? 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(156,163,175,0.1) 4px, rgba(156,163,175,0.1) 6px)' : ps.pattern,
                                                    textDecoration: isCancelled ? 'line-through' : 'none',
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedMeeting(meeting);
                                                }}
                                            >
                                                {!isCancelled && <span className="mr-1 text-[10px] font-bold">{platformMeta.short}</span>}
                                                {meeting.isRecurring && <span className="mr-1" title="Recurring meeting">🔄</span>}
                                                {isCancelled && <span className="mr-0.5">✕</span>}
                                                {isCompleted && <span className="mr-0.5">✓</span>}
                                                {new Date(meeting.startTime).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    timeZone: timezone,
                                                })} {meeting.title}
                                            </div>
                                        );
                                    })}
                                    {dayMeetings.length > 3 && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            +{dayMeetings.length - 3} more
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex flex-row justify-between items-center gap-2.5 bg-white dark:bg-[#292929] px-3 py-2 border-b border-gray-200 dark:border-[#3d3d3d] shrink-0 overflow-x-auto">
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handlePrevious}
                        className="px-2.5 py-1.5 bg-white dark:bg-[#3d3d3d] border border-gray-300 dark:border-[#4a4a4a] rounded hover:bg-gray-50 dark:hover:bg-[#4a4a4a] transition text-gray-700 dark:text-gray-200 text-sm"
                    >
                        ←
                    </button>
                    <button
                        onClick={handleToday}
                        className="px-3 py-1.5 bg-blue-600 dark:bg-[#6264a7] text-white rounded hover:bg-blue-700 dark:hover:bg-[#7173b3] transition text-sm font-medium"
                    >
                        Today
                    </button>
                    <button
                        onClick={handleNext}
                        className="px-2.5 py-1.5 bg-white dark:bg-[#3d3d3d] border border-gray-300 dark:border-[#4a4a4a] rounded hover:bg-gray-50 dark:hover:bg-[#4a4a4a] transition text-gray-700 dark:text-gray-200 text-sm"
                    >
                        →
                    </button>
                    <span className="ml-2 text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {view === 'week'
                            ? `${getWeekDays()[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${getWeekDays()[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : view === 'month'
                                ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                                : currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                        }
                    </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="px-2.5 py-1.5 bg-white dark:bg-[#3d3d3d] border border-gray-300 dark:border-[#4a4a4a] rounded text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                        {timezones.map(tz => (
                            <option key={tz.value} value={tz.value}>
                                {tz.label}
                            </option>
                        ))}
                    </select>

                    <div className="flex gap-0.5 bg-gray-100 dark:bg-[#3d3d3d] border border-gray-200 dark:border-[#4a4a4a] rounded p-0.5">
                        <button
                            onClick={() => setView('day')}
                            className={`px-3 py-1 rounded text-sm font-medium transition ${view === 'day'
                                ? 'bg-white dark:bg-[#6264a7] text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#4a4a4a]'
                                }`}
                        >
                            Day
                        </button>
                        <button
                            onClick={() => setView('week')}
                            className={`px-3 py-1 rounded text-sm font-medium transition ${view === 'week'
                                ? 'bg-white dark:bg-[#6264a7] text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#4a4a4a]'
                                }`}
                        >
                            Week
                        </button>
                        <button
                            onClick={() => setView('month')}
                            className={`px-3 py-1 rounded text-sm font-medium transition ${view === 'month'
                                ? 'bg-white dark:bg-[#6264a7] text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#4a4a4a]'
                                }`}
                        >
                            Month
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-white dark:bg-[#292929] overflow-hidden">
                {loading ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Loading calendar...
                    </div>
                ) : (
                    view === 'week' ? renderWeekView() : view === 'day' ? renderDayView() : renderMonthView()
                )}
            </div>

            {showScheduleForm && (
                <ScheduleMeeting
                    onClose={() => {
                        setShowScheduleForm(false);
                        setSelectedSlot(null);
                    }}
                    onMeetingCreated={() => {
                        fetchMeetings();
                        setShowScheduleForm(false);
                    }}
                    initialDate={selectedSlot}
                />
            )}

            {selectedMeeting && (
                <EventDetailModal
                    meeting={selectedMeeting}
                    onClose={() => setSelectedMeeting(null)}
                    onDelete={handleDeleteMeeting}
                    onEdit={handleEditMeeting}
                    canDelete={selectedMeeting.organizerEmail === user?.email}
                    deleting={deleting}
                    timezone={timezone}
                />
            )}

            {editingMeeting && (
                <ScheduleMeeting
                    onClose={() => setEditingMeeting(null)}
                    onMeetingCreated={() => {
                        fetchMeetings();
                        setEditingMeeting(null);
                    }}
                    editMeeting={editingMeeting}
                />
            )}
        </div>
    );
}
