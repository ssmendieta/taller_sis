// Fase 2: frontend solo conoce el Gateway
const API_GATEWAY_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_GATEWAY_URL || "http://localhost:3000";
export const apiConfig = { gatewayUrl: API_GATEWAY_URL, apiUrl: API_GATEWAY_URL };
