// Instantané des statistiques d'audience de ContourBuddyApp
// Source : analytics de la version publiée (contourbuddy.lovable.app)
// Période : 24/07/2026 → 23/08/2026 (30 derniers jours)

export const STATS_PERIOD = {
  start: "2026-07-24",
  end: "2026-08-23",
  label: "24 juil. → 23 août 2026",
  updatedAt: "2026-08-23",
};

export const STATS_TOTALS = {
  visitors: 73,
  pageviews: 90,
  pageviewsPerVisit: 1.23,
  sessionDuration: 145, // secondes (moyenne)
  bounceRate: 75, // %
};

export type DailyPoint = {
  date: string;
  visitors: number;
  pageviews: number;
  duration: number;
  bounce: number;
};

export const DAILY: DailyPoint[] = [
  { date: "2026-07-24", visitors: 5, pageviews: 6, duration: 27.5, bounce: 80 },
  { date: "2026-07-25", visitors: 2, pageviews: 3, duration: 115.52, bounce: 50 },
  { date: "2026-07-26", visitors: 6, pageviews: 8, duration: 72.98, bounce: 67 },
  { date: "2026-07-27", visitors: 3, pageviews: 3, duration: 0, bounce: 100 },
  { date: "2026-07-28", visitors: 10, pageviews: 11, duration: 5.84, bounce: 90 },
  { date: "2026-07-29", visitors: 1, pageviews: 1, duration: 0, bounce: 100 },
  { date: "2026-07-30", visitors: 1, pageviews: 1, duration: 0, bounce: 100 },
  { date: "2026-07-31", visitors: 1, pageviews: 1, duration: 0, bounce: 100 },
  { date: "2026-08-01", visitors: 1, pageviews: 3, duration: 1402.64, bounce: 0 },
  { date: "2026-08-02", visitors: 3, pageviews: 3, duration: 0, bounce: 100 },
  { date: "2026-08-03", visitors: 0, pageviews: 0, duration: 0, bounce: 0 },
  { date: "2026-08-04", visitors: 3, pageviews: 3, duration: 0, bounce: 100 },
  { date: "2026-08-05", visitors: 3, pageviews: 3, duration: 0, bounce: 100 },
  { date: "2026-08-06", visitors: 1, pageviews: 1, duration: 0, bounce: 100 },
  { date: "2026-08-07", visitors: 0, pageviews: 0, duration: 0, bounce: 0 },
  { date: "2026-08-08", visitors: 1, pageviews: 1, duration: 0, bounce: 100 },
  { date: "2026-08-09", visitors: 2, pageviews: 3, duration: 13.92, bounce: 50 },
  { date: "2026-08-10", visitors: 4, pageviews: 5, duration: 413.12, bounce: 75 },
  { date: "2026-08-11", visitors: 7, pageviews: 10, duration: 4.56, bounce: 71 },
  { date: "2026-08-12", visitors: 6, pageviews: 6, duration: 0, bounce: 100 },
  { date: "2026-08-13", visitors: 5, pageviews: 5, duration: 0, bounce: 100 },
  { date: "2026-08-14", visitors: 0, pageviews: 0, duration: 0, bounce: 0 },
  { date: "2026-08-15", visitors: 1, pageviews: 2, duration: 343.67, bounce: 0 },
  { date: "2026-08-16", visitors: 1, pageviews: 1, duration: 0, bounce: 100 },
  { date: "2026-08-17", visitors: 0, pageviews: 0, duration: 0, bounce: 0 },
  { date: "2026-08-18", visitors: 0, pageviews: 0, duration: 0, bounce: 0 },
  { date: "2026-08-19", visitors: 1, pageviews: 1, duration: 0, bounce: 100 },
  { date: "2026-08-20", visitors: 1, pageviews: 4, duration: 332.75, bounce: 0 },
  { date: "2026-08-21", visitors: 3, pageviews: 3, duration: 0, bounce: 100 },
  { date: "2026-08-22", visitors: 1, pageviews: 2, duration: 886.29, bounce: 0 },
  { date: "2026-08-23", visitors: 0, pageviews: 0, duration: 0, bounce: 0 },
];

export const SOURCES = [
  { name: "Direct", visitors: 28 },
  { name: "l.facebook.com", visitors: 17 },
  { name: "linkedin.com", visitors: 15 },
  { name: "lm.facebook.com", visitors: 5 },
  { name: "bing.com", visitors: 2 },
  { name: "search.brave.com", visitors: 2 },
  { name: "com.linkedin.android", visitors: 2 },
  { name: "facebook.com", visitors: 1 },
  { name: "ecosia.org", visitors: 1 },
  { name: "m.facebook.com", visitors: 1 },
];

export const CHANNELS = [
  { name: "Réseaux sociaux", visitors: 41 },
  { name: "Direct", visitors: 28 },
  { name: "Moteurs de recherche", visitors: 5 },
];

export const DEVICES = [
  { name: "Mobile", visitors: 40 },
  { name: "Ordinateur", visitors: 33 },
];

export const COUNTRIES = [
  { code: "FR", name: "France", visitors: 57 },
  { code: "US", name: "États-Unis", visitors: 7 },
  { code: "IT", name: "Italie", visitors: 5 },
  { code: "??", name: "Inconnu", visitors: 2 },
  { code: "BE", name: "Belgique", visitors: 1 },
  { code: "ES", name: "Espagne", visitors: 1 },
];

export const PAGES = [{ path: "/", label: "Carte / accueil", pageviews: 73 }];
