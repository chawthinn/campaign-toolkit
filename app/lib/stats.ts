const VISITS_KEY = 'ct-visits';
const ANALYSES_KEY = 'ct-analyses';
const SESSION_KEY = 'ct-visited';

export function getVisits(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(VISITS_KEY) ?? '0', 10);
}

export function getAnalyses(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(ANALYSES_KEY) ?? '0', 10);
}

export function recordVisit(): void {
  if (typeof window === 'undefined') return;
  if (sessionStorage.getItem(SESSION_KEY)) return;
  sessionStorage.setItem(SESSION_KEY, '1');
  localStorage.setItem(VISITS_KEY, String(getVisits() + 1));
}

export function recordAnalysis(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ANALYSES_KEY, String(getAnalyses() + 1));
  window.dispatchEvent(new Event('ct-stats-updated'));
}
