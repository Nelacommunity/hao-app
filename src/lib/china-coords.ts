// Mainland China map tiles (Apple Maps/AutoNavi, Google Maps China) use GCJ-02, which is offset
// 300–500 m from GPS (WGS-84). Pins and route lines from GPS data must be shifted before drawing.
// Standard public conversion; outside China it returns the input unchanged.
import type { Coords } from '@/lib/location';

const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina({ latitude, longitude }: Coords) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLat(x: number, y: number) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return ret;
}

function transformLon(x: number, y: number) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return ret;
}

export function wgs84ToGcj02(point: Coords): Coords {
  if (outOfChina(point)) return point;
  const dLat = transformLat(point.longitude - 105, point.latitude - 35);
  const dLon = transformLon(point.longitude - 105, point.latitude - 35);
  const radLat = (point.latitude / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  return {
    latitude: point.latitude + (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI),
    longitude: point.longitude + (dLon * 180) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI),
  };
}
