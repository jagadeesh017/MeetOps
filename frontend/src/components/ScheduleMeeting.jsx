import { useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../context/Authcontext';
import { createMeeting, updateMeeting, checkAttendeeAvailability } from '../services/api';
import { getTimezoneList } from '../utils/calendarUtils';
import { getIntegrationStatus } from '../services/integrations';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm';

const PLATFORMS = [
    { value: 'zoom', label: 'Zoom' },
    { value: 'meet', label: 'Google Meet' },
];

const INTEGRATION_WARNINGS = {
    meet: { key: 'google', msg: 'Google Calendar is not connected. Connect it in the dashboard to use Google Meet.' },
    google: { key: 'google', msg: 'Google Calendar is not connected. Connect it in the dashboard to use Google Meet.' },
    zoom: { key: 'zoom', msg: 'Zoom is not connected. Connect it in the dashboard to use Zoom meetings.' },
};

function toLocalDate(d) {
    return (d ? new Date(d) : new Date()).toLocaleDateString('en-CA');
}

function roundedTimeSlot(date) {
    const d = date ? new Date(date) : new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
    return d.toTimeString().slice(0, 5);
}

function addMinutes(timeStr, mins) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + mins, 0, 0);
    return d.toTimeString().slice(0, 5);
}

function buildDateTime(dateStr, timeStr) {
    return new Date(`${dateStr}T${timeStr}`);
}

function getMeetingField(meeting, field) {
    return meeting.meetings?.[0]?.[field] ?? meeting[field];
}

function safeErrorMsg(err, fallback) {
    const msg = err.response?.data?.message || err.response?.data?.error || fallback;
    return msg.length < 100 && !msg.includes('videoResult') ? msg : fallback;
}

function Label({ children }) {
    return <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{children}</label>;
}

function SuccessBanner({ meeting, isEditMode }) {
    return (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4 text-green-800 dark:text-green-300 text-sm">
            <p className="font-semibold mb-2">{isEditMode ? 'Meeting updated successfully' : 'Meeting created successfully'}</p>
            <div className="space-y-2">
                <div>
                    <span className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Title</span>
                    <p className="font-medium">{getMeetingField(meeting, 'title')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <span className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Platform</span>
                        <p className="font-medium capitalize">{getMeetingField(meeting, 'platform')}</p>
                    </div>
                    <div>
                        <span className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Attendees</span>
                        <p className="font-medium">{getMeetingField(meeting, 'attendees')?.length || 0}</p>
                    </div>
                </div>
                <div>
                    <span className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Scheduled time</span>
                    <p className="font-medium">{new Date(getMeetingField(meeting, 'startTime')).toLocaleString()}</p>
                </div>
                {getMeetingField(meeting, 'joinUrl') && (
                    <a href={getMeetingField(meeting, 'joinUrl')} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold">
                        Join meeting link
                    </a>
                )}
                {meeting.meetings && (
                    <p className="text-xs text-green-700 dark:text-green-400">Created {meeting.meetings.length} recurring meetings.</p>
                )}
            </div>
        </div>
    );
}

function BusyWarning({ busyAttendees, onProceed, onCancel, loading }) {
    return (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded p-4 text-yellow-800 dark:text-yellow-300 text-sm">
            <div className="flex items-start gap-2 mb-2">
                <span className="text-lg">⚠️</span>
                <div className="flex-1">
                    <p className="font-semibold mb-1">Some attendees are busy</p>
                    <p className="text-xs mb-2">The following attendees have conflicting meetings:</p>
                    <ul className="space-y-1 text-xs">
                        {busyAttendees.map((a, idx) => (
                            <li key={idx} className="ml-4">
                                <strong>{a.name}</strong> ({a.email})<br />
                                <span className="text-yellow-600 dark:text-yellow-400">Busy ({a.conflictStartTime} - {a.conflictEndTime})</span>
                            </li>
                        ))}
                    </ul>
                    <div className="flex gap-2 mt-3">
                        <button onClick={onProceed} disabled={loading}
                            className="px-4 py-2 text-xs font-semibold rounded-lg bg-yellow-500 text-white shadow-sm hover:bg-yellow-600 transition disabled:opacity-50">
                            Proceed Anyway
                        </button>
                        <button onClick={onCancel}
                            className="px-4 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-[#3d3d3d] border border-gray-200 dark:border-[#4a4a4a] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#444] shadow-sm transition">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ScheduleMeeting({ onClose, onMeetingCreated, initialDate = null, editMeeting = null }) {
    const isEditMode = !!editMeeting;
    const { user } = useContext(AuthContext);
    const { showToast } = useToast();
    const suggestionsRef = useRef(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMeeting, setSuccessMeeting] = useState(null);
    const [integrations, setIntegrations] = useState({ google: { connected: false }, zoom: { connected: false } });
    const [integrationsLoaded, setIntegrationsLoaded] = useState(false);
    const [busyAttendees, setBusyAttendees] = useState([]);
    const [showBusyWarning, setShowBusyWarning] = useState(false);
    const [checkingAvailability, setCheckingAvailability] = useState(false);
    const [attendeeInput, setAttendeeInput] = useState('');
    const [attendeeSuggestions, setAttendeeSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const timezones = getTimezoneList();
    const defaultStart = roundedTimeSlot(initialDate);

    const [formData, setFormData] = useState(() => {
        if (editMeeting) {
            const s = new Date(editMeeting.startTime), e = new Date(editMeeting.endTime);
            return {
                title: editMeeting.title || '', startDate: s.toLocaleDateString('en-CA'), startTime: s.toTimeString().slice(0, 5),
                endDate: e.toLocaleDateString('en-CA'), endTime: e.toTimeString().slice(0, 5),
                timezone: editMeeting.timezone || 'Asia/Kolkata', platform: editMeeting.platform || 'zoom',
                description: editMeeting.description || '', isRecurring: false, recurrencePattern: 'daily',
                recurrenceMode: 'count', recurrenceEndDate: '', recurrenceCount: 1,
            };
        }
        return {
            title: '', startDate: toLocalDate(initialDate), startTime: defaultStart,
            endDate: toLocalDate(initialDate), endTime: addMinutes(defaultStart, 30),
            timezone: 'Asia/Kolkata', platform: 'zoom', description: '',
            isRecurring: false, recurrencePattern: 'daily', recurrenceMode: 'count',
            recurrenceEndDate: '', recurrenceCount: 1,
        };
    });

    const [attendees, setAttendees] = useState(() =>
        editMeeting?.attendees?.map(a => ({ email: a.email, name: a.name || a.email.split('@')[0] })) || []
    );

    const integrationWarning = (() => {
        if (!integrationsLoaded) return null;
        const cfg = INTEGRATION_WARNINGS[formData.platform];
        return cfg && !integrations[cfg.key]?.connected ? cfg.msg : null;
    })();

    useEffect(() => {
        getIntegrationStatus()
            .then(setIntegrations)
            .catch(() => console.error('Failed to fetch integration status'))
            .finally(() => setIntegrationsLoaded(true));
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) setShowSuggestions(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (attendeeInput.length < 2) { setAttendeeSuggestions([]); return; }

        const debounce = setTimeout(async () => {
            let suggestions = [];
            try {
                const response = await api.get(`/auth/search?q=${encodeURIComponent(attendeeInput)}`);
                suggestions = response.data.filter(u => !attendees.some(a => a.email === u.email) && u.email !== user?.email);
            } catch { }

            const isValid = EMAIL_REGEX.test(attendeeInput);
            const isDuplicate = attendees.some(a => a.email === attendeeInput) || suggestions.some(s => s.email === attendeeInput);
            if (isValid && !isDuplicate && attendeeInput !== user?.email) {
                suggestions.push({ email: attendeeInput, name: attendeeInput.split('@')[0], isExternal: true });
            }

            setAttendeeSuggestions(suggestions);
            setShowSuggestions(suggestions.length > 0);
        }, 300);
        return () => clearTimeout(debounce);
    }, [attendeeInput, attendees, user?.email]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => {
            const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
            if (name === 'startTime') next.endTime = addMinutes(value, 30);
            if (name === 'startDate') next.endDate = value;
            return next;
        });
    };

    const handleAddAttendee = (attendee) => {
        if (!attendee.email || attendees.some(a => a.email === attendee.email)) return;
        setAttendees([...attendees, attendee]);
        setAttendeeInput('');
        setShowSuggestions(false);
        setAttendeeSuggestions([]);
    };

    const handleAttendeeKeyPress = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (EMAIL_REGEX.test(attendeeInput)) {
            handleAddAttendee({ email: attendeeInput, name: attendeeInput.split('@')[0] });
        } else if (attendeeSuggestions.length > 0) {
            handleAddAttendee(attendeeSuggestions[0]);
        }
    };

    const getDateTimes = () => ({
        start: buildDateTime(formData.startDate, formData.startTime),
        end: buildDateTime(formData.endDate, formData.endTime),
    });

    const handleSubmit = async (e, forceIgnoreBusy = false) => {
        e.preventDefault();
        setError(null);
        setSuccessMeeting(null);

        const { start, end } = getDateTimes();
        if (start <= new Date()) return setError('Start date and time cannot be in the past. Please select a future time.');
        if (end <= start) return setError('End time must be after start time');

        const meetingData = {
            title: formData.title, startTime: start.toISOString(), endTime: end.toISOString(),
            organizerEmail: user?.email || '', attendees: attendees.map(a => ({ name: a.name, email: a.email })),
            platform: formData.platform, timezone: formData.timezone, description: formData.description,
            isRecurring: formData.isRecurring,
            recurrencePattern: formData.isRecurring ? formData.recurrencePattern : null,
            recurrenceEndDate: formData.isRecurring && formData.recurrenceEndDate ? formData.recurrenceEndDate : null,
            recurrenceCount: formData.isRecurring && !formData.recurrenceEndDate ? parseInt(formData.recurrenceCount) : null,
            ignoreBusy: forceIgnoreBusy,
        };

        setLoading(true);
        try {
            const result = isEditMode ? await updateMeeting(editMeeting._id, meetingData) : await createMeeting(meetingData);
            const meeting = result.meeting || result;
            setSuccessMeeting(meeting);
            setShowBusyWarning(false);
            onMeetingCreated?.(meeting);
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.busyAttendees) {
                setBusyAttendees(err.response.data.busyAttendees);
                setShowBusyWarning(true);
            } else {
                setError(safeErrorMsg(err, isEditMode ? 'Failed to update meeting' : 'Failed to create meeting'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCheckAvailability = async () => {
        if (attendees.length === 0) return setError('Please add at least one attendee to check availability');
        setCheckingAvailability(true);
        setBusyAttendees([]);
        setError(null);

        const { start, end } = getDateTimes();
        try {
            const result = await checkAttendeeAvailability(
                attendees.map(a => ({ name: a.name, email: a.email })), start.toISOString(), end.toISOString()
            );
            if (result.available) {
                setBusyAttendees([]);
                showToast('All attendees are available for this time slot', 'success');
            } else {
                setBusyAttendees(result.busyAttendees);
                setShowBusyWarning(true);
            }
        } catch (err) {
            setError(safeErrorMsg(err, 'Failed to check availability'));
        } finally {
            setCheckingAvailability(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#292929] rounded-lg shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">

                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#3d3d3d]">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {isEditMode ? 'Edit meeting' : 'New meeting'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="space-y-4">

                        {successMeeting && <SuccessBanner meeting={successMeeting} isEditMode={isEditMode} />}

                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-red-700 dark:text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {integrationWarning && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-blue-700 dark:text-blue-400 text-sm flex justify-between items-center">
                                <span>⚠️ {integrationWarning}</span>
                                <a href="/dashboard" className="text-blue-600 dark:text-[#6264a7] font-semibold underline">Connect now</a>
                            </div>
                        )}

                        {showBusyWarning && busyAttendees.length > 0 && (
                            <BusyWarning busyAttendees={busyAttendees} loading={loading}
                                onProceed={(e) => { setShowBusyWarning(false); handleSubmit(e, true); }}
                                onCancel={() => setShowBusyWarning(false)} />
                        )}


                        <div>
                            <input type="text" name="title" value={formData.title} onChange={handleInputChange}
                                className="w-full px-3 py-2.5 text-lg font-medium border-0 border-b-2 border-gray-200 dark:border-[#3d3d3d] focus:border-blue-600 dark:focus:border-[#6264a7] focus:outline-none dark:bg-[#292929] dark:text-gray-100"
                                placeholder="Add title" required />
                        </div>


                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Start</Label>
                                <div className="space-y-2">
                                    <input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} min={toLocalDate()} className={INPUT_CLS} required />
                                    <input type="time" name="startTime" value={formData.startTime} onChange={handleInputChange}
                                        min={formData.startDate === toLocalDate() ? new Date().toTimeString().slice(0, 5) : undefined} className={INPUT_CLS} required />
                                </div>
                            </div>
                            <div>
                                <Label>End</Label>
                                <div className="space-y-2">
                                    <input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} min={formData.startDate || toLocalDate()} className={INPUT_CLS} required />
                                    <input type="time" name="endTime" value={formData.endTime} onChange={handleInputChange}
                                        min={formData.endDate === formData.startDate ? formData.startTime : undefined} className={INPUT_CLS} required />
                                </div>
                            </div>
                        </div>


                        <div>
                            <Label>Time zone</Label>
                            <select name="timezone" value={formData.timezone} onChange={handleInputChange} className={INPUT_CLS}>
                                {timezones.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                            </select>
                        </div>


                        <div>
                            <Label>Add required attendees</Label>
                            <div className="relative" ref={suggestionsRef}>
                                <input type="text" value={attendeeInput} onChange={(e) => setAttendeeInput(e.target.value)}
                                    onKeyPress={handleAttendeeKeyPress} className={INPUT_CLS}
                                    placeholder="Type a name to search or enter any email" />
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Type any email and press Enter to add external attendees</p>

                                {showSuggestions && attendeeSuggestions.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-[#3d3d3d] border border-gray-200 dark:border-[#4a4a4a] rounded shadow-lg max-h-48 overflow-y-auto">
                                        {attendeeSuggestions.map((s, idx) => (
                                            <div key={idx} onClick={() => handleAddAttendee(s)}
                                                className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-[#4a4a4a] cursor-pointer border-b border-gray-100 dark:border-[#4a4a4a] last:border-0">
                                                {s.isExternal ? (
                                                    <>
                                                        <div className="font-medium text-sm text-blue-600 dark:text-blue-400">+ Add "{s.email}"</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">External attendee</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{s.name}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">{s.email}</div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {attendees.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {attendees.map((a, idx) => (
                                        <div key={idx} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-[#3d3d3d] rounded text-sm">
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-medium text-gray-900 dark:text-gray-100">{a.name || a.email}</span>
                                                    {a.isExternal && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">External</span>}
                                                </div>
                                                {a.name && <div className="text-xs text-gray-500 dark:text-gray-400">{a.email}</div>}
                                            </div>
                                            <button type="button" onClick={() => setAttendees(attendees.filter(x => x.email !== a.email))}
                                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg">×</button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={handleCheckAvailability} disabled={checkingAvailability}
                                        className="w-full mt-2 px-3 py-2 text-xs font-semibold rounded-lg border border-blue-200 dark:border-[#6264a7] text-blue-600 dark:text-[#b7b9ff] bg-blue-50 dark:bg-[#2f2f3d] hover:bg-blue-100 dark:hover:bg-[#34344a] shadow-sm transition disabled:opacity-50">
                                        {checkingAvailability ? '⏳ Checking...' : '🔍 Check Availability'}
                                    </button>
                                </div>
                            )}
                        </div>


                        <div>
                            <Label>Meeting platform</Label>
                            <select name="platform" value={formData.platform} onChange={handleInputChange} className={INPUT_CLS}>
                                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                        </div>


                        <div>
                            <Label>Add a description</Label>
                            <textarea name="description" value={formData.description} onChange={handleInputChange} rows="3"
                                className={`${INPUT_CLS} resize-none`} placeholder="Add details for the meeting" />
                        </div>


                        {!isEditMode && (
                            <div className="pt-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Repeat</span>
                                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, isRecurring: !prev.isRecurring }))}
                                        className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${formData.isRecurring ? 'bg-blue-600 dark:bg-[#6264a7]' : 'bg-gray-300 dark:bg-[#4a4a4a]'}`}>
                                        <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ${formData.isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                {formData.isRecurring && (
                                    <div className="mt-3 ml-6 space-y-3 p-3 bg-gray-50 dark:bg-[#3d3d3d] rounded">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Repeat</label>
                                            <select name="recurrencePattern" value={formData.recurrencePattern} onChange={handleInputChange}
                                                className="w-full px-2 py-1.5 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] dark:bg-[#292929] dark:text-gray-100 text-sm">
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                                <option value="monthly">Monthly</option>
                                            </select>
                                        </div>

                                        <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-[#4a4a4a] text-xs font-medium">
                                            {['count', 'endDate'].map(mode => (
                                                <button key={mode} type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, recurrenceMode: mode, ...(mode === 'count' ? { recurrenceEndDate: '' } : { recurrenceCount: 1 }) }))}
                                                    className={`flex-1 py-1.5 transition ${formData.recurrenceMode === mode
                                                        ? 'bg-blue-600 dark:bg-[#6264a7] text-white'
                                                        : 'bg-white dark:bg-[#292929] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#333]'}`}>
                                                    {mode === 'count' ? 'Occurrences' : 'End Date'}
                                                </button>
                                            ))}
                                        </div>

                                        {formData.recurrenceMode === 'count' ? (
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Number of occurrences</label>
                                                <input type="number" name="recurrenceCount" value={formData.recurrenceCount} onChange={handleInputChange}
                                                    min="1" max="100" className="w-full px-2 py-1.5 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] dark:bg-[#292929] dark:text-gray-100 text-sm" />
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">End date</label>
                                                <input type="date" name="recurrenceEndDate" value={formData.recurrenceEndDate} onChange={handleInputChange}
                                                    min={formData.startDate} className="w-full px-2 py-1.5 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] dark:bg-[#292929] dark:text-gray-100 text-sm" />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </form>


                <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-200 dark:border-[#3d3d3d]">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-[#4a4a4a] text-gray-700 dark:text-gray-200 bg-white dark:bg-[#2f2f2f] hover:bg-gray-100 dark:hover:bg-[#3a3a3a] shadow-sm transition">
                        {successMeeting ? 'Close' : 'Cancel'}
                    </button>
                    {!successMeeting && (
                        <button onClick={handleSubmit} disabled={loading}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 dark:bg-[#6264a7] text-white shadow-md hover:bg-blue-700 dark:hover:bg-[#6b6db2] transition disabled:opacity-50 disabled:cursor-not-allowed">
                            {loading ? (isEditMode ? 'Updating...' : 'Sending...') : (isEditMode ? 'Update' : 'Send')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
