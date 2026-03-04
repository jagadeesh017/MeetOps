import api from './api';

const getEndpoint = async (path) => {
    const response = await api.get(path);
    return response.data;
};

const postEndpoint = async (path, data) => {
    const response = await api.post(path, data);
    return response.data;
};

export const getIntegrationStatus = () => getEndpoint('/api/integrations/status');
export const connectGoogle = () => getEndpoint('/api/integrations/google/connect');
export const connectZoom = () => getEndpoint('/api/integrations/zoom/connect');
export const disconnectIntegration = (platform) => postEndpoint('/api/integrations/disconnect', { platform });
