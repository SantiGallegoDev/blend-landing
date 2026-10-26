import { mediaRoute } from '../../../lib/media';

// Vista previa de fotos dentro del panel (mismo origen: la CSP solo permite img-src 'self').
export const GET = mediaRoute();
