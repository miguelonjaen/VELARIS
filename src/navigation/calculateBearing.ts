export function calculateBearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {

  const φ1 = from.lat * Math.PI / 180;
  const φ2 = to.lat * Math.PI / 180;
  const Δλ = (to.lng - from.lng) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);

  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) *
      Math.cos(φ2) *
      Math.cos(Δλ);

  return (
    (Math.atan2(y, x) * 180) / Math.PI +
    360
  ) % 360;
}