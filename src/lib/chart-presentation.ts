const INDIA_OFFSET = 330 * 60_000;

export function indiaDateKey(date: Date) {
  return new Date(date.getTime() + INDIA_OFFSET).toISOString().slice(0, 10);
}

export function previousIndiaMonthStart(date: Date) {
  const local = new Date(date.getTime() + INDIA_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - INDIA_OFFSET);
}

export type RevenuePoint = { date: string; revenue: number };

// Keep partial periods visible as a separate amount, never as a completed trend.
export function revenuePresentation(data: RevenuePoint[], period: 'daily' | 'monthly', now = new Date()) {
  const current = indiaDateKey(now).slice(0, period === 'monthly' ? 7 : 10);
  const key = (point: RevenuePoint) => point.date.slice(0, current.length);
  return {
    completed: data.filter(point => key(point) < current),
    current: data.find(point => key(point) === current),
  };
}

export function growthDirection(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'unavailable';
  // Match the one-decimal value shown to the user.
  if (Number(Math.abs(value).toFixed(1)) === 0) return 'unchanged';
  return value > 0 ? 'increase' : 'decrease';
}
