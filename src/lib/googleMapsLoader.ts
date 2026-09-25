/**
 * Quản lý nạp và cấu hình Google Maps JavaScript API
 */
import { Loader } from '@googlemaps/js-api-loader';

const STORAGE_KEY = 'cic_google_maps_api_key';

let activeLoader: Loader | null = null;
let googleMapsPromise: Promise<typeof google.maps> | null = null;

export function getStoredGoogleMapsApiKey(): string {
  if (typeof window === 'undefined') return '';
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage && fromStorage.trim().length > 0) {
    return fromStorage.trim();
  }
  const fromEnv = ((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string) || '';
  return fromEnv.trim();
}

export function setStoredGoogleMapsApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return;
  if (!apiKey || apiKey.trim().length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, apiKey.trim());
  }
  // Reset loader cache để tải lại khi đổi key
  activeLoader = null;
  googleMapsPromise = null;
}

export async function loadGoogleMaps(apiKeyOverride?: string): Promise<typeof google.maps> {
  const apiKey = (apiKeyOverride || getStoredGoogleMapsApiKey()).trim();

  if (!apiKey) {
    throw new Error('Chưa cung cấp Google Maps API Key');
  }

  // Nếu đã nạp rồi
  if (typeof window !== 'undefined' && (window as any).google?.maps) {
    return (window as any).google.maps;
  }

  if (!googleMapsPromise) {
    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places', 'geometry', 'marker'],
      language: 'vi',
      region: 'VN',
    });
    activeLoader = loader;

    const promise: Promise<typeof google.maps> = (loader as any).load().then((g: any) => g.maps);
    googleMapsPromise = promise;
    return promise;
  }

  return googleMapsPromise;
}

export function isGoogleMapsLoaded(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).google?.maps);
}
