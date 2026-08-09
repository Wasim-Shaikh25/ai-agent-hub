import { query, queryOne } from '../db/pool.js';
import { redact } from '../privacy/redact.js';

export interface TrainingSample {
  id: string;
  org_id: string | null;
  kind: string;
  input: string;
  output: string;
  meta: Record<string, unknown>;
  rating: number | null;
  created_at: string;
}

/**
 * User feedback labels (👍/👎) and copilot exchanges, redacted before storage.
 * Written via POST /api/feedback and the operator copilot — not from live
 * gateway traffic (we do not harvest prompt/response pairs).
 */
export class TrainingService {
  async record(kind: string, orgId: string | null, input: string, output: string, meta: Record<string, unknown> = {}, rating: number | null = null): Promise<void> {
    await query(
      `INSERT INTO training_sample (org_id, kind, input, output, meta, rating) VALUES ($1,$2,$3,$4,$5,$6)`,
      [orgId, kind, redact(input).text.slice(0, 8000), redact(output).text.slice(0, 8000), JSON.stringify(meta), rating],
    );
  }

  list(kind: string | undefined, limit = 50): Promise<TrainingSample[]> {
    const lim = Math.min(Math.max(limit, 1), 500);
    return kind
      ? query<TrainingSample>('SELECT * FROM training_sample WHERE kind = $1 ORDER BY created_at DESC LIMIT $2', [kind, lim])
      : query<TrainingSample>('SELECT * FROM training_sample ORDER BY created_at DESC LIMIT $1', [lim]);
  }

  async stats(): Promise<{ total: number; byKind: Array<{ kind: string; n: number }> }> {
    const total = await queryOne<{ n: string }>('SELECT COUNT(*) AS n FROM training_sample');
    const byKind = await query<{ kind: string; n: string }>('SELECT kind, COUNT(*) AS n FROM training_sample GROUP BY kind ORDER BY 2 DESC');
    return { total: Number(total?.n ?? 0), byKind: byKind.map((r) => ({ kind: r.kind, n: Number(r.n) })) };
  }
}

export const training = new TrainingService();
