import { query } from '../db/pool.js';
import { PrivacyService } from './privacyService.js';

const privacy = new PrivacyService();
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Periodically applies each org's retention policy
 * (`{ kind: "retention", spec: { days } }`), deleting context + usage older
 * than the window. Runs shortly after boot, then daily.
 */
export function startRetentionScheduler(): () => void {
  const run = async (): Promise<void> => {
    try {
      const rows = await query<{ org_id: string; spec: { days?: number } }>(
        `SELECT org_id, spec FROM policy WHERE kind = 'retention' AND enabled = true`,
      );
      for (const r of rows) {
        const days = Number(r.spec?.days ?? 0);
        if (days > 0) await privacy.runRetention(r.org_id, days);
      }
    } catch (err) {
      console.error('[retention] sweep failed:', err instanceof Error ? err.message : err);
    }
  };

  const first = setTimeout(() => void run(), 60_000); // 1 min after boot
  const interval = setInterval(() => void run(), DAY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
