import { useEffect, useLayoutEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE_URL, TILE_ATTRIBUTION, getTileBlob } from '../services/mapTiles';
import { placeKind } from '../constants';

/**
 * Camada que pega cada tile do aparelho (e salva os novos) — é o que faz o
 * mapa abrir sem internet. O Leaflet aceita createTile assíncrono via `done`.
 */
const OfflineTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const img = document.createElement('img');
    img.alt = '';
    getTileBlob(this.getTileUrl(coords))
      .then((blob) => {
        const src = URL.createObjectURL(blob);
        img.onload = () => { URL.revokeObjectURL(src); done(null, img); };
        img.onerror = (e) => { URL.revokeObjectURL(src); done(e, img); };
        img.src = src;
      })
      .catch((err) => done(err, img));
    return img;
  },
});

const BRAZIL = [-14.2, -51.9];

function placeIcon(place) {
  const kind = placeKind(place.kind);
  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="w-[34px] h-[34px] rounded-full border-2 border-white shadow-soft-md flex items-center justify-center text-base ${place.pending ? 'opacity-60 border-dashed' : ''}" style="background:${kind.color}">${kind.emoji}</div>`,
  });
}

/**
 * Mapa da viagem: lugares marcados (todos os da pessoa), sua posição (bolinha
 * azul + círculo da precisão do GPS) e o ponto escolhido com um toque (`pick`).
 * Abre enquadrado em `framePlaces` (os desta viagem).
 *
 * `mapRef` recebe a instância do Leaflet — a página usa pra centralizar e
 * pra saber a área visível ao salvar o mapa offline.
 */
export default function TripMap({ places, framePlaces, me, pick, onPick, onSelectPlace, mapRef }) {
  const elRef = useRef(null);
  const map = useRef(null);
  const framed = useRef(false);
  const handlers = useRef({ onPick, onSelectPlace });
  useLayoutEffect(() => { handlers.current = { onPick, onSelectPlace }; });

  useEffect(() => {
    const m = L.map(elRef.current, { center: BRAZIL, zoom: 4 });
    framed.current = false;
    new OfflineTileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(m);
    m.on('click', (e) => handlers.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    // A tela entra com animação de escala — o Leaflet precisa remedir depois.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(elRef.current);
    map.current = m;
    if (mapRef) mapRef.current = m;
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      if (mapRef) mapRef.current = null;
    };
  }, [mapRef]);

  useEffect(() => {
    const group = L.layerGroup(places.map((p) => {
      const label = document.createElement('span');
      label.textContent = p.name; // texto puro: o tooltip do Leaflet aceitaria HTML
      return L.marker([p.lat, p.lng], { icon: placeIcon(p) })
        .bindTooltip(label, { direction: 'top', offset: [0, -16] })
        .on('click', () => handlers.current.onSelectPlace?.(p));
    })).addTo(map.current);
    return () => group.remove();
  }, [places]);

  // Enquadra uma vez: nos lugares desta viagem ou, sem eles, na sua posição.
  useEffect(() => {
    if (framed.current) return;
    if (framePlaces.length) {
      map.current.fitBounds(L.latLngBounds(framePlaces.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 16 });
      framed.current = true;
    } else if (me) {
      map.current.setView([me.lat, me.lng], 16);
      framed.current = true;
    }
  }, [framePlaces, me]);

  useEffect(() => {
    if (!me) return;
    const layers = [
      L.circle([me.lat, me.lng], { radius: me.accuracy, color: '#3b82f6', weight: 1, fillOpacity: 0.12, interactive: false }),
      L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1, interactive: false }),
    ].map((l) => l.addTo(map.current));
    return () => layers.forEach((l) => l.remove());
  }, [me]);

  useEffect(() => {
    if (!pick) return;
    const marker = L.circleMarker([pick.lat, pick.lng], { radius: 10, color: '#18181b', weight: 3, fillColor: '#b8e94e', fillOpacity: 1, interactive: false }).addTo(map.current);
    return () => marker.remove();
  }, [pick]);

  // `isolate`: os z-index internos do Leaflet (400–1000) ficam presos aqui e
  // não passam por cima do header nem dos modais.
  return <div ref={elRef} className="isolate h-[55vh] min-h-[320px] md:h-[520px] w-full bg-ink-100" />;
}
