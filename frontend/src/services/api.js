// Servicios API - Fase 2 se conectará vía API Gateway
// No conectar React directamente a microservicios en Fase 1
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL || "http://localhost:3000";
export const apiConfig = { gatewayUrl: API_GATEWAY_URL };
