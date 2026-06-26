import * as L from 'leaflet';

export interface MapCollection {
  id: number;
  gpsLat: number;
  gpsLng: number;
  distanceToCustomerM: number | null;
  isVerified: boolean;
  collectedAt: string;
  customer: { id: number; code: string; name: string; lat: number; lng: number };
  manager: { id: number; name: string };
}

export const CHINA_CENTER: L.LatLngTuple = [35.86, 104.19];
export const DEFAULT_ZOOM = 5;

export function verifiedColor(verified: boolean): string {
  return verified ? '#67c23a' : '#f56c6c';
}

export function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(iso: string): string {
  if (iso === '') return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function formatDistance(m: number | null): string {
  if (m === null) return '-';
  return `${m.toFixed(0)} m`;
}

export function popupHtml(c: MapCollection): string {
  const verifiedLabel = c.isVerified
    ? '<span style="color:#67c23a;font-weight:600">已核实</span>'
    : '<span style="color:#f56c6c;font-weight:600">未核实</span>';
  return (
    '<div style="font-size:13px;line-height:1.7;min-width:200px">' +
    `<div style="font-weight:600;font-size:14px;margin-bottom:4px">` +
    `${escapeHtml(c.customer.name)}</div>` +
    `客户编码：${escapeHtml(c.customer.code)}<br/>` +
    `经理：${escapeHtml(c.manager.name)}<br/>` +
    `采集时间：${formatDateTime(c.collectedAt)}<br/>` +
    `距离客户：${formatDistance(c.distanceToCustomerM)}<br/>` +
    `核实状态：${verifiedLabel}` +
    '</div>'
  );
}

export interface MapController {
  map: L.Map | null;
  markersLayer: L.LayerGroup | null;
  init: (container: HTMLDivElement) => void;
  renderMarkers: (collections: readonly MapCollection[]) => void;
  destroy: () => void;
}

export function createMapController(): MapController {
  const controller: MapController = {
    map: null,
    markersLayer: null,
    init(container) {
      if (container === null || controller.map !== null) return;
      controller.map = L.map(container, {
        center: CHINA_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: 3,
        maxZoom: 18,
        zoomControl: true,
        scrollWheelZoom: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(controller.map);
      controller.markersLayer = L.layerGroup().addTo(controller.map);
    },
    renderMarkers(collections) {
      const { map, markersLayer } = controller;
      if (map === null || markersLayer === null) return;
      markersLayer.clearLayers();
      const placed: L.LatLng[] = [];
      for (const c of collections) {
        const { lat, lng } = c.customer;
        if (!isValidCoord(lat, lng)) continue;
        const color = verifiedColor(c.isVerified);
        const marker = L.circleMarker([lat, lng], {
          radius: 9,
          color,
          fillColor: color,
          fillOpacity: 0.75,
          weight: 2,
        });
        marker.bindPopup(popupHtml(c));
        marker.addTo(markersLayer);
        placed.push(L.latLng(lat, lng));
      }
      if (placed.length > 0) {
        const bounds = L.latLngBounds(placed);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      } else {
        map.setView(CHINA_CENTER, DEFAULT_ZOOM);
      }
    },
    destroy() {
      if (controller.map !== null) {
        controller.map.remove();
        controller.map = null;
      }
      controller.markersLayer = null;
    },
  };
  return controller;
}