import { useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../context/Authcontext';
import { createMeeting, checkAttendeeAvailability } from '../services/api';
import { getTimezoneList } from '../utils/calendarUtils';
import { getIntegrationStatus } from '../services/integrations';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function ScheduleMeeting({ onClose, onMeetingCreated, initialDate = null }) {
    const { user } = useContext(AuthContext);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMeeting, setSuccessMeeting] = useState(null);
    const [integrations, setIntegrations] = useState({
        google: { connected: false },
        zoom: { connected: false }
    });
    const [integrationsLoaded, setIntegrationsLoaded] = useState(false);
    const [integrationWarning, setIntegrationWarning] = useState(null);
    const [busyAttendees, setBusyAttendees] = useState([]);
    const [showBusyWarning, setShowBusyWarning] = useState(false);
    const [checkingAvailability, setCheckingAvailability] = useState(false);

    const getNextTimeSlot = () => {
        const now = initialDate || new Date();
        const minutes = now.getMinutes();
        const roundedMinutes = Math.ceil(minutes / 30) * 30;
        now.setMinutes(roundedMinutes);
        now.setSeconds(0);
        return now.toTimeString().slice(0, 5);
    };

    const getDefaultEndTime = (startTime) => {
        if (!startTime) return '';
        const [hours, minutes] = startTime.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes + 30);
        return date.toTimeString().slice(0, 5);
    };

    const defaultStartTime = getNextTimeSlot();

    const [formData, setFormData] = useState({
        title: '',
        startDate: initialDate ? initialDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        startTime: defaultStartTime,
        endDate: initialDate ? initialDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        endTime: getDefaultEndTime(defaultStartTime),
        timezone: 'Asia/Kolkata',
        platform: 'zoom',
        description: '',
        isRecurring: false,
        recurrencePattern: 'daily',
        recurrenceEndDate: '',
        recurrenceCount: 1,
    });

    const [attendees, setAttendees] = useState([]);
    const [attendeeInput, setAttendeeInput] = useState('');
    const [attendeeSuggestions, setAttendeeSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef(null);
    const { showToast } = useToast();

    const timezones = getTimezoneList();
    const platforms = [
        { value: 'zoom', label: 'Zoom' },
        { value: 'meet', label: 'Google Meet' },
        { value: 'teams', label: 'Microsoft Teams' },
    ];

    useEffect(() => {
        const fetchIntegrations = async () => {
            try {
                const status = await getIntegrationStatus();
                setIntegrations(status);
            } catch {
                console.error('Failed to fetch integration status');
            } finally {
                setIntegrationsLoaded(true);
            }
        };
        fetchIntegrations();
    }, []);

    useEffect(() => {
        if (!integrationsLoaded) {
            setIntegrationWarning(null);
            return;
        }
        if (formData.platform === 'meet' || formData.platform === 'google') {
            if (!integrations.google.connected) {
                setIntegrationWarning('Google Calendar is not connected. Connect it in the dashboard to use Google Meet.');
            } else {
                setIntegrationWarning(null);
            }
        } else if (formData.platform === 'zoom') {
            if (!integrations.zoom.connected) {
                setIntegrationWarning('Zoom is not connected. Connect it in the dashboard to use Zoom meetings.');
            } else {
                setIntegrationWarning(null);
            }
        } else {
            setIntegrationWarning(null);
        }
    }, [formData.platform, integrations]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const searchUsers = async () => {
            if (attendeeInput.length < 2) {
                setAttendeeSuggestions([]);
                return;
            }

            try {
                const response = await api.get(`/auth/search?q=${encodeURIComponent(attendeeInput)}`);
                const suggestions = response.data.filter(
                    u => !attendees.some(a => a.email === u.email) && u.email !== user.email
                );
                setAttendeeSuggestions(suggestions);
                setShowSuggestions(suggestions.length > 0);
            } catch (err) {
                console.error('Error searching users:', err);
                setAttendeeSuggestions([]);
            }
        };

        const debounce = setTimeout(searchUsers, 300);
        return () => clearTimeout(debounce);
    }, [attendeeInput, attendees, user?.email]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        if (name === 'startTime') {
            const endTime = getDefaultEndTime(value);
            setFormData(prev => ({ ...prev, endTime }));
        }

        if (name === 'startDate') {
            setFormData(prev => ({ ...prev, endDate: value }));
        }
    };

    const handleAddAttendee = (attendee) => {
        if (!attendee.email) return;
        if (attendees.some(a => a.email === attendee.email)) return;

        setAttendees([...attendees, attendee]);
        setAttendeeInput('');
        setShowSuggestions(false);
        setAttendeeSuggestions([]);
    };

    const handleRemoveAttendee = (email) => {
        setAttendees(attendees.filter(a => a.email !== email));
    };

    const handleAttendeeKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(attendeeInput)) {
                handleAddAttendee({ email: attendeeInput, name: attendeeInput.split('@')[0] });
            } else if (attendeeSuggestions.length > 0) {
                handleAddAttendee(attendeeSuggestions[0]);
            }
        }
    };

    const handleSubmit = async (e, forceIgnoreBusy = false) => {
        e.preventDefault();
        setError(null);
        setSuccessMeeting(null);

        const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
        const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);

        if (endDateTime <= startDateTime) {
            setError('End time must be after start time');
            return;
        }

        const meetingData = {
            title: formData.title,
            startTime: startDateTime.toISOString(),
            endTime: endDateTime.toISOString(),
            organizerEmail: user?.email || '',
            attendees: attendees.map(a => ({ name: a.name, email: a.email })),
            platform: formData.platform,
            timezone: formData.timezone,
            description: formData.description,
            isRecurring: formData.isRecurring,
            recurrencePattern: formData.isRecurring ? formData.recurrencePattern : null,
            recurrenceEndDate: formData.isRecurring && formData.recurrenceEndDate ? formData.recurrenceEndDate : null,
            recurrenceCount: formData.isRecurring && !formData.recurrenceEndDate ? parseInt(formData.recurrenceCount) : null,
            ignoreBusy: forceIgnoreBusy,
        };

        setLoading(true);
        try {
            const createdMeeting = await createMeeting(meetingData);
            setSuccessMeeting(createdMeeting);
            setShowBusyWarning(false);
            if (onMeetingCreated) {
                onMeetingCreated(createdMeeting);
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to create meeting';
            setError(msg.length < 100 && !msg.includes('videoResult') ? msg : 'Failed to create meeting');
            
            if (err.response?.status === 409 && err.response?.data?.busyAttendees) {
                setBusyAttendees(err.response.data.busyAttendees);
                setShowBusyWarning(true);
                setError(null);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCheckAvailability = async () => {
        if (attendees.length === 0) {
            setError('Please add at least one attendee to check availability');
            return;
        }

        setCheckingAvailability(true);
        setBusyAttendees([]);
        setError(null);

        const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
        const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);

        try {
            const result = await checkAttendeeAvailability(
                attendees.map(a => ({ name: a.name, email: a.email })),
                startDateTime.toISOString(),
                endDateTime.toISOString()
            );

            if (result.available) {
                setError(null);
                setBusyAttendees([]);
                showToast('All attendees are available for this time slot', 'success');
            } else {
                setBusyAttendees(result.busyAttendees);
                setShowBusyWarning(true);
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to check availability';
            setError(msg.length < 100 && !msg.includes('videoResult') ? msg : 'Failed to check availability');
        } finally {
            setCheckingAvailability(false);
        }
    };

    const handleProceedAnyway = (e) => {
        setShowBusyWarning(false);
        handleSubmit(e, true);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#292929] rounded-lg shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#3d3d3d]">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        New meeting
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="space-y-4">

                        {successMeeting && (
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4 text-green-800 dark:text-green-300 text-sm">
                                <p className="font-semibold mb-2">Meeting created successfully</p>
                                <div className="space-y-2">
                                    <div>
                                        <span className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Title</span>
                                        <p className="font-medium">
                                            {(successMeeting.meetings && successMeeting.meetings[0]?.title) || successMeeting.title}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <span className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Platform</span>
                                            <p className="font-medium capitalize">
                                                {(successMeeting.meetings && successMeeting.meetings[0]?.platform) || successMeeting.platform}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Attendees</span>
                                            <p className="font-medium">
                                                {(successMeeting.meetings && successMeeting.meetings[0]?.attendees?.length) || successMeeting.attendees?.length || 0}
                                            </p>
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Scheduled time</span>
                                        <p className="font-medium">
                                            {new Date((successMeeting.meetings && successMeeting.meetings[0]?.startTime) || successMeeting.startTime).toLocaleString()}
                                        </p>
                                    </div>
                                    {(successMeeting.joinUrl || (successMeeting.meetings && successMeeting.meetings[0]?.joinUrl)) && (
                                        <a
                                            href={(successMeeting.meetings && successMeeting.meetings[0]?.joinUrl) || successMeeting.joinUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold"
                                        >
                                            Join meeting link
                                        </a>
                                    )}
                                    {successMeeting.meetings && (
                                        <p className="text-xs text-green-700 dark:text-green-400">
                                            Created {successMeeting.meetings.length} recurring meetings.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

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
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded p-4 text-yellow-800 dark:text-yellow-300 text-sm">
                                <div className="flex items-start gap-2 mb-2">
                                    <span className="text-lg">⚠️</span>
                                    <div className="flex-1">
                                        <p className="font-semibold mb-1">Some attendees are busy</p>
                                        <p className="text-xs mb-2">The following attendees have conflicting meetings:</p>
                                        <ul className="space-y-1 text-xs">
                                            {busyAttendees.map((attendee, idx) => (
                                                <li key={idx} className="ml-4">
                                                    <strong>{attendee.name}</strong> ({attendee.email})
                                                    <br />
                                                    <span className="text-yellow-600 dark:text-yellow-400">
                                                        Busy ({attendee.conflictStartTime} - {attendee.conflictEndTime})
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={handleProceedAnyway}
                                                disabled={loading}
                                                className="px-4 py-2 text-xs font-semibold rounded-lg bg-yellow-500 text-white shadow-sm hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 transition disabled:opacity-50"
                                            >
                                                Proceed Anyway
                                            </button>
                                            <button
                                                onClick={() => setShowBusyWarning(false)}
                                                className="px-4 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-[#3d3d3d] border border-gray-200 dark:border-[#4a4a4a] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#444] shadow-sm transition"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Title */}
                        <div>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2.5 text-lg font-medium border-0 border-b-2 border-gray-200 dark:border-[#3d3d3d] focus:border-blue-600 dark:focus:border-[#6264a7] focus:outline-none dark:bg-[#292929] dark:text-gray-100"
                                placeholder="Add title"
                                required
                            />
                        </div>

                        {/* Date and Time */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                    Start
                                </label>
                                <div className="space-y-2">
                                    <input
                                        type="date"
                                        name="startDate"
                                        value={formData.startDate}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm"
                                        required
                                    />
                                    <input
                                        type="time"
                                        name="startTime"
                                        value={formData.startTime}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                    End
                                </label>
                                <div className="space-y-2">
                                    <input
                                        type="date"
                                        name="endDate"
                                        value={formData.endDate}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm"
                                        required
                                    />
                                    <input
                                        type="time"
                                        name="endTime"
                                        value={formData.endTime}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Timezone */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                Time zone
                            </label>
                            <select
                                name="timezone"
                                value={formData.timezone}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm"
                            >
                                {timezones.map(tz => (
                                    <option key={tz.value} value={tz.value}>
                                        {tz.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Add attendees */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                Add required attendees
                            </label>
                            <div className="relative" ref={suggestionsRef}>
                                <input
                                    type="text"
                                    value={attendeeInput}
                                    onChange={(e) => setAttendeeInput(e.target.value)}
                                    onKeyPress={handleAttendeeKeyPress}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm"
                                    placeholder="Enter a name or email address"
                                />

                                {showSuggestions && attendeeSuggestions.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-[#3d3d3d] border border-gray-200 dark:border-[#4a4a4a] rounded shadow-lg max-h-48 overflow-y-auto">
                                        {attendeeSuggestions.map((suggestion, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => handleAddAttendee(suggestion)}
                                                className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-[#4a4a4a] cursor-pointer border-b border-gray-100 dark:border-[#4a4a4a] last:border-0"
                                            >
                                                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{suggestion.name}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{suggestion.email}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {attendees.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {attendees.map((attendee, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-[#3d3d3d] rounded text-sm"
                                        >
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-gray-100">{attendee.name || attendee.email}</div>
                                                {attendee.name && <div className="text-xs text-gray-500 dark:text-gray-400">{attendee.email}</div>}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAttendee(attendee.email)}
                                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={handleCheckAvailability}
                                        disabled={checkingAvailability}
                                        className="w-full mt-2 px-3 py-2 text-xs font-semibold rounded-lg border border-blue-200 dark:border-[#6264a7] text-blue-600 dark:text-[#b7b9ff] bg-blue-50 dark:bg-[#2f2f3d] hover:bg-blue-100 dark:hover:bg-[#34344a] shadow-sm transition disabled:opacity-50"
                                    >
                                        {checkingAvailability ? '⏳ Checking...' : '🔍 Check Availability'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Platform */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                Meeting platform
                            </label>
                            <select
                                name="platform"
                                value={formData.platform}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm"
                            >
                                {platforms.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                Add a description
                            </label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleInputChange}
                                rows="3"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] focus:border-blue-600 dark:focus:border-[#6264a7] dark:bg-[#3d3d3d] dark:text-gray-100 text-sm resize-none"
                                placeholder="Add details for the meeting"
                            />
                        </div>

                        {/* Recurring */}
                        <div className="pt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="isRecurring"
                                    checked={formData.isRecurring}
                                    onChange={handleInputChange}
                                    className="w-4 h-4 text-blue-600 dark:text-[#6264a7] border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-blue-600 dark:focus:ring-[#6264a7]"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                    Repeat
                                </span>
                            </label>

                            {formData.isRecurring && (
                                <div className="mt-3 ml-6 space-y-3 p-3 bg-gray-50 dark:bg-[#3d3d3d] rounded">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                            Repeat
                                        </label>
                                        <select
                                            name="recurrencePattern"
                                            value={formData.recurrencePattern}
                                            onChange={handleInputChange}
                                            className="w-full px-2 py-1.5 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] dark:bg-[#292929] dark:text-gray-100 text-sm"
                                        >
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                End date
                                            </label>
                                            <input
                                                type="date"
                                                name="recurrenceEndDate"
                                                value={formData.recurrenceEndDate}
                                                onChange={handleInputChange}
                                                className="w-full px-2 py-1.5 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] dark:bg-[#292929] dark:text-gray-100 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                Occurrences
                                            </label>
                                            <input
                                                type="number"
                                                name="recurrenceCount"
                                                value={formData.recurrenceCount}
                                                onChange={handleInputChange}
                                                min="1"
                                                max="100"
                                                className="w-full px-2 py-1.5 border border-gray-300 dark:border-[#4a4a4a] rounded focus:ring-1 focus:ring-blue-600 dark:focus:ring-[#6264a7] dark:bg-[#292929] dark:text-gray-100 text-sm"
                                                disabled={formData.recurrenceEndDate}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-200 dark:border-[#3d3d3d]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-[#4a4a4a] text-gray-700 dark:text-gray-200 bg-white dark:bg-[#2f2f2f] hover:bg-gray-100 dark:hover:bg-[#3a3a3a] shadow-sm transition"
                    >
                        {successMeeting ? 'Close' : 'Cancel'}
                    </button>
                    {!successMeeting && (
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 dark:bg-[#6264a7] text-white shadow-md hover:bg-blue-700 dark:hover:bg-[#6b6db2] transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Sending...' : 'Send'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
