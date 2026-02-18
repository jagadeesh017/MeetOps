import moment from 'moment-timezone';

export const getTimezoneList = () => {
    return [
        { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
        { value: 'America/New_York', label: 'EST (Eastern Time)' },
        { value: 'America/Chicago', label: 'CST (Central Time)' },
        { value: 'America/Denver', label: 'MST (Mountain Time)' },
        { value: 'America/Los_Angeles', label: 'PST (Pacific Time)' },
        { value: 'Europe/London', label: 'GMT (London)' },
        { value: 'Europe/Paris', label: 'CET (Central European Time)' },
        { value: 'Asia/Dubai', label: 'GST (Gulf Standard Time)' },
        { value: 'Asia/Kolkata', label: 'IST (Indian Standard Time)' },
        { value: 'Asia/Singapore', label: 'SGT (Singapore Time)' },
        { value: 'Asia/Tokyo', label: 'JST (Japan Standard Time)' },
        { value: 'Australia/Sydney', label: 'AEDT (Australian Eastern Time)' },
    ];
};

export const getLocalTimezone = () => {
    return moment.tz.guess();
};
