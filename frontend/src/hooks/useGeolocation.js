import { useEffect, useState } from 'react';

/**
 * Posição do GPS em tempo real. Funciona sem internet — o GPS do celular não
 * depende de rede. Só liga o sensor enquanto `enabled` (economiza bateria).
 *
 * @returns {{ position: { lat, lng, accuracy } | null, error: string | null }}
 */
export function useGeolocation(enabled = true) {
  const [position, setPosition] = useState(null);
  const supported = 'geolocation' in navigator;
  const [error, setError] = useState(supported ? null : 'Este aparelho não informa a localização.');

  useEffect(() => {
    if (!enabled || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setError(null);
      },
      (e) => setError(
        e.code === e.PERMISSION_DENIED
          ? 'Localização bloqueada — libere nas permissões do navegador.'
          : 'Procurando o GPS… em lugar aberto o sinal pega mais rápido.'
      ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, supported]);

  return { position, error };
}
