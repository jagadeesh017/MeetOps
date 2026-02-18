import { useState, useCallback, useContext, useEffect } from 'react';
import { AuthContext } from '../context/Authcontext';
import { getMeetings } from '../services/api';
import { getTimezoneList, getLocalTimezone } from '../utils/calendarUtils';
import ScheduleMeeting from './ScheduleMeeting';

const PLATFORM_CONFIG = {
    zoom: { label: 'Zoom', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', accent: '#2D8CFF' },
    meet: { label: 'Google Meet', color: 'bg-green-100 text-green-700', dot: 'bg-green-500', accent: '#34A853' },
    google: { label: 'Google Meet', color: 'bg-green-100 text-green-700', dot: 'bg-green-500', accent: '#34A853' },
    teams: { label: 'Teams', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500', accent: '#6264a7' },
    other: { label: 'Other', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400', accent: '#6264a7' },
};

function getPlatformStyle(platform) {
    const colors = {
        zoom: { bg: '#2D8CFF', border: '#1a6fd4', text: '#ffffff' },
        meet: { bg: '#34A853', border: '#1e7e34', text: '#ffffff' },
        google: { bg: '#34A853', border: '#1e7e34', text: '#ffffff' },
        teams: { bg: '#6264a7', border: '#4a4c8a', text: '#ffffff' },
        webex: { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
        other: { bg: '#6b7280', border: '#4b5563', text: '#ffffff' },
    };
    return colors[platform] || colors.other;
}

function EventDetailModal({ meeting, onClose }) {
    if (!meeting) return null;
    const platform = meeting.platform || 'other';
    const cfg = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.other;
    const attendees = meeting.attendees || [];

    const fmt = (d) => new Date(d).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

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
                {/* Colored top strip */}
                <div className="h-1.5 w-full" style={{ background: cfg.accent }} />

                <div className="p-5">
                    {/* Title + close */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                                {meeting.title}
                            </h2>
                            <span className={`inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none mt-0.5 flex-shrink-0"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Time */}
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                        <span>🕐</span>
                        <span>{fmt(meeting.startTime)} – {fmtTime(meeting.endTime)}</span>
                    </div>

                    {/* Organizer */}
                    {meeting.organizerEmail && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <span>👤</span>
                            <span><strong>Organizer:</strong> {meeting.organizerEmail}</span>
                        </div>
                    )}

                    {/* Attendees */}
                    {attendees.length > 0 && (
                        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <span className="mt-0.5">👥</span>
                            <div><strong>Attendees:</strong> {attendees.map(a => a.name || a.email).join(', ')}</div>
                        </div>
                    )}

                    {/* Description */}
                    {meeting.description && (
                        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                            <span className="mt-0.5">📝</span>
                            <span>{meeting.description}</span>
                        </div>
                    )}

                    <div className="border-t border-gray-200 dark:border-gray-600 my-4" />

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        {meeting.joinUrl ? (
                            <a
                                href={meeting.joinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
                                style={{ background: cfg.accent }}
                            >
                                Join {cfg.label}
                            </a>
                        ) : (
                            <div className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 text-sm">
                                No join link available
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
    const [timezone, setTimezone] = useState(getLocalTimezone());
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [selectedMeeting, setSelectedMeeting] = useState(null);

    const timezones = getTimezoneList();
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const fetchMeetings = useCallback(async () => {
        if (!user?.email) return;
        try {
            setLoading(false);
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
        const slotDate = new Date(day);
        slotDate.setHours(hour, 0, 0, 0);
        setSelectedSlot(slotDate);
        setShowScheduleForm(true);
    };

    const getMeetingsForDay = (day) => {
        return meetings.filter(meeting => {
            const meetingStart = new Date(meeting.startTime);
            const dayStart = new Date(day);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(day);
            dayEnd.setHours(23, 59, 59, 999);

            return meetingStart >= dayStart && meetingStart <= dayEnd;
        });
    };

    const calculateMeetingPosition = (meeting, slotHeight) => {
        const start = new Date(meeting.startTime);
        const end = new Date(meeting.endTime);

        const startHour = start.getHours();
        const startMinute = start.getMinutes();
        const endHour = end.getHours();
        const endMinute = end.getMinutes();

        const startOffset = (startMinute / 60) * slotHeight;
        const totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        const height = (totalMinutes / 60) * slotHeight;

        return {
            top: startHour * slotHeight + startOffset,
            height: Math.max(height, 20)
        };
    };

    const renderWeekView = () => {
        const weekDays = getWeekDays();
        const slotHeight = 48;

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
                            <div className={`text-lg font-semibold ${day.toDateString() === new Date().toDateString()
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
                                        const ps = getPlatformStyle(meeting.platform);
                                        return (
                                            <div
                                                key={idx}
                                                className="absolute inset-x-1 rounded px-1 py-0.5 text-xs overflow-hidden cursor-pointer hover:shadow-lg hover:brightness-95 transition"
                                                style={{
                                                    top: `${pos.top}px`,
                                                    height: `${pos.height}px`,
                                                    backgroundColor: ps.bg,
                                                    borderLeft: `4px solid ${ps.border}`,
                                                    color: ps.text,
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedMeeting(meeting);
                                                }}
                                            >
                                                <div className="font-medium truncate">
                                                    {meeting.title}
                                                </div>
                                                {pos.height > 30 && (
                                                    <div className="text-[10px] opacity-75">
                                                        {new Date(meeting.startTime).toLocaleTimeString('en-US', {
                                                            hour: 'numeric',
                                                            minute: '2-digit'
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
                            {hours.map(hour => (
                                <div
                                    key={hour}
                                    onClick={() => handleSlotClick(currentDate, hour)}
                                    className="h-16 border-t border-gray-100 dark:border-[#3d3d3d] hover:bg-gray-50 dark:hover:bg-[#333333] cursor-pointer bg-white dark:bg-[#292929]"
                                />
                            ))}

                            {dayMeetings.map((meeting, idx) => {
                                const pos = calculateMeetingPosition(meeting, slotHeight);
                                const ps = getPlatformStyle(meeting.platform);
                                return (
                                    <div
                                        key={idx}
                                        className="absolute inset-x-2 rounded px-2 py-1 overflow-hidden cursor-pointer hover:shadow-lg hover:brightness-95 transition"
                                        style={{
                                            top: `${pos.top}px`,
                                            height: `${pos.height}px`,
                                            backgroundColor: ps.bg,
                                            borderLeft: `4px solid ${ps.border}`,
                                            color: ps.text,
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedMeeting(meeting);
                                        }}
                                    >
                                        <div className="font-semibold truncate">
                                            {meeting.title}
                                        </div>
                                        <div className="text-xs opacity-75">
                                            {new Date(meeting.startTime).toLocaleTimeString('en-US', {
                                                hour: 'numeric',
                                                minute: '2-digit'
                                            })} - {new Date(meeting.endTime).toLocaleTimeString('en-US', {
                                                hour: 'numeric',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderMonthView = () => {
        const monthDays = getMonthDays();
        const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
                        const isToday = day.toDateString() === new Date().toDateString();

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
                                        return (
                                            <div
                                                key={mIdx}
                                                className="text-xs px-1 py-0.5 rounded truncate cursor-pointer hover:brightness-95 transition"
                                                style={{
                                                    backgroundColor: ps.bg,
                                                    borderLeft: `3px solid ${ps.border}`,
                                                    color: ps.text,
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedMeeting(meeting);
                                                }}
                                            >
                                                {new Date(meeting.startTime).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit'
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
            <div className="mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-[#292929] p-3 rounded-lg border border-gray-200 dark:border-[#3d3d3d]">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrevious}
                        className="px-3 py-1.5 bg-white dark:bg-[#3d3d3d] border border-gray-300 dark:border-[#4a4a4a] rounded hover:bg-gray-50 dark:hover:bg-[#4a4a4a] transition text-gray-700 dark:text-gray-200 font-medium"
                    >
                        ←
                    </button>
                    <button
                        onClick={handleToday}
                        className="px-4 py-1.5 bg-blue-600 dark:bg-[#6264a7] text-white rounded hover:bg-blue-700 dark:hover:bg-[#7173b3] transition font-medium"
                    >
                        Today
                    </button>
                    <button
                        onClick={handleNext}
                        className="px-3 py-1.5 bg-white dark:bg-[#3d3d3d] border border-gray-300 dark:border-[#4a4a4a] rounded hover:bg-gray-50 dark:hover:bg-[#4a4a4a] transition text-gray-700 dark:text-gray-200 font-medium"
                    >
                        →
                    </button>
                    <span className="ml-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {view === 'week'
                            ? `${getWeekDays()[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${getWeekDays()[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : view === 'month'
                                ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                                : currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                        }
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="px-2 py-1.5 bg-white dark:bg-[#3d3d3d] border border-gray-300 dark:border-[#4a4a4a] rounded text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {timezones.map(tz => (
                            <option key={tz.value} value={tz.value}>
                                {tz.label.split('(')[0].trim()}
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

            <div className="flex-1 bg-white dark:bg-[#292929] rounded-lg border border-gray-200 dark:border-[#3d3d3d] overflow-hidden">
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
                />
            )}
        </div>
    );
}
