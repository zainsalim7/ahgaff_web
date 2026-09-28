import React, { useEffect, useRef } from 'react';

const CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
let loading: Promise<any> | null = null;

const loadLeaflet = (): Promise<any> => {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CSS; document.head.appendChild(l); }
    const s = document.createElement('script'); s.src = JS; s.onload = () => resolve(w.L); s.onerror = () => reject(new Error('leaflet load failed')); document.head.appendChild(s);
  });
  return loading;
};

export type GeoLoc = { id: string; name: string; latitude: number; longitude: number; radius_meters: number; is_active?: boolean };
export type GeoPoint = { lat: number; lng: number; label: string; color: string };

/** 🗺️ خريطة OpenStreetMap (Leaflet عبر CDN، ويب فقط): دوائر المواقع + نقاط التسجيل + اختيار إحداثيات بالنقر */
export const GeoMap: React.FC<{ locations: GeoLoc[]; points?: GeoPoint[]; onPick?: (lat: number, lng: number) => void; picked?: { lat: number; lng: number } | null; height?: number; testID?: string }> = ({ locations, points = [], onPick, picked, height = 380, testID }) => {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !ref.current || map.current) return;
      map.current = L.map(ref.current, { zoomControl: true }).setView([14.54, 49.13], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      map.current.on('click', (e: any) => pickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
      draw(L);
    }).catch(() => {});
    return () => { dead = true; if (map.current) { map.current.remove(); map.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = (L: any) => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const bounds: any[] = [];
    locations.forEach((l) => {
      const c = l.is_active === false ? '#94a3b8' : '#1565c0';
      L.circle([l.latitude, l.longitude], { radius: l.radius_meters, color: c, fillColor: c, fillOpacity: 0.12, weight: 2 }).bindTooltip(`${l.name} — ${l.radius_meters} م`, { direction: 'top' }).addTo(layer.current);
      bounds.push([l.latitude, l.longitude]);
    });
    points.forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 0.95 }).bindTooltip(p.label, { direction: 'top' }).addTo(layer.current);
      bounds.push([p.lat, p.lng]);
    });
    if (picked) { L.marker([picked.lat, picked.lng]).addTo(layer.current); bounds.push([picked.lat, picked.lng]); }
    if (bounds.length) map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
  };

  useEffect(() => { const L = (window as any).L; if (L && map.current) draw(L); }, [locations, points, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', direction: 'ltr' }} data-testid={testID || 'geo-map'} />;
};
