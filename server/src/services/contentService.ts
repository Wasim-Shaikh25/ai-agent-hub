import { query, queryOne } from '../db/pool.js';
import { hasRole } from '../auth.js';
import { PolicyService } from './policyService.js';

export type ContentType = 'skill' | 'rule' | 'hook' | 'workflow' | 'persona';

export interface ContentItem {
  id: string;
  org_id: string;
  type: ContentType;
  slug: string;
  name: string;
  description: string;
  body: string;
  trigger: string | null;
  enabled: boolean;
  status: string;
  version: number;
}

export interface ContentVersion {
  id: string;
  version: number;
  name: string;
  description: string;
  body: string;
  trigger: string | null;
  status: string;
  actor_id: string | null;
  created_at: string;
}

export interface Actor {
  userId: string;
  role: string;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Content registry with version history + optional approval workflow.
 *
 * When an org sets a `content` policy `{ requireApproval: true }`, edits by
 * non-admins are staged as `pending` versions and do NOT change the live item
 * until an admin approves; agents only ever receive `approved` + enabled items.
 */
export class ContentService {
  constructor(private readonly policies = new PolicyService()) {}

  private async requireApproval(orgId: string): Promise<boolean> {
    const rows = await this.policies.list(orgId, 'content');
    return rows.some((p) => p.enabled && p.spec['requireApproval'] === true);
  }

  list(orgId: string, type?: ContentType): Promise<ContentItem[]> {
    return type
      ? query<ContentItem>('SELECT * FROM content_item WHERE org_id = $1 AND type = $2 ORDER BY type, name', [orgId, type])
      : query<ContentItem>('SELECT * FROM content_item WHERE org_id = $1 ORDER BY type, name', [orgId]);
  }

  /** Only approved + enabled items — this is what agents receive. */
  listEnabled(orgId: string, type?: ContentType): Promise<ContentItem[]> {
    return type
      ? query<ContentItem>(`SELECT * FROM content_item WHERE org_id = $1 AND type = $2 AND enabled = true AND status = 'approved' ORDER BY type, name`, [orgId, type])
      : query<ContentItem>(`SELECT * FROM content_item WHERE org_id = $1 AND enabled = true AND status = 'approved' ORDER BY type, name`, [orgId]);
  }

  listVersions(orgId: string, id: string): Promise<ContentVersion[]> {
    return query<ContentVersion>(
      'SELECT id, version, name, description, body, trigger, status, actor_id, created_at FROM content_version WHERE org_id = $1 AND content_item_id = $2 ORDER BY version DESC',
      [orgId, id],
    );
  }

  private async snapshot(item: ContentItem, status: string, actor: Actor): Promise<void> {
    await query(
      `INSERT INTO content_version (org_id, content_item_id, version, name, description, body, trigger, status, actor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [item.org_id, item.id, item.version, item.name, item.description, item.body, item.trigger, status, actor.userId],
    );
  }

  async create(
    orgId: string,
    input: { type: ContentType; name: string; description?: string; body?: string; trigger?: string; enabled?: boolean },
    actor: Actor,
  ): Promise<ContentItem> {
    const staged = (await this.requireApproval(orgId)) && !hasRole(actor.role, 'admin');
    const status = staged ? 'pending' : 'approved';
    const slug = slugify(input.name);
    const item = await queryOne<ContentItem>(
      `INSERT INTO content_item (org_id, type, slug, name, description, body, trigger, enabled, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (org_id, type, slug)
       DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, body = EXCLUDED.body,
                     trigger = EXCLUDED.trigger, enabled = EXCLUDED.enabled, status = EXCLUDED.status,
                     version = content_item.version + 1, updated_at = now()
       RETURNING *`,
      [orgId, input.type, slug, input.name, input.description ?? '', input.body ?? '', input.trigger ?? null, input.enabled ?? true, status],
    );
    await this.snapshot(item!, status, actor);
    return item!;
  }

  /**
   * Updates an item. When approval is required and the actor is a non-admin, the
   * change is staged as a pending version and the live item is left untouched;
   * the returned item reflects that (`staged: true`).
   */
  async update(
    orgId: string,
    id: string,
    fields: Partial<Pick<ContentItem, 'name' | 'description' | 'body' | 'enabled' | 'trigger'>>,
    actor: Actor,
  ): Promise<(ContentItem & { staged?: boolean }) | undefined> {
    const current = await queryOne<ContentItem>('SELECT * FROM content_item WHERE org_id = $1 AND id = $2', [orgId, id]);
    if (!current) return undefined;

    const staged = (await this.requireApproval(orgId)) && !hasRole(actor.role, 'admin');
    const merged: ContentItem = {
      ...current,
      name: fields.name ?? current.name,
      description: fields.description ?? current.description,
      body: fields.body ?? current.body,
      trigger: fields.trigger ?? current.trigger,
      enabled: fields.enabled ?? current.enabled,
      version: current.version + 1,
    };

    if (staged) {
      // Stage a pending version; leave the live (approved) item unchanged.
      await this.snapshot(merged, 'pending', actor);
      return { ...current, staged: true };
    }

    const updated = await queryOne<ContentItem>(
      `UPDATE content_item SET name=$3, description=$4, body=$5, enabled=$6, trigger=$7,
              status='approved', version = version + 1, updated_at = now()
        WHERE org_id = $1 AND id = $2 RETURNING *`,
      [orgId, id, merged.name, merged.description, merged.body, merged.enabled, merged.trigger],
    );
    await this.snapshot(updated!, 'approved', actor);
    return updated!;
  }

  /** Promotes the latest pending version into the live item (admin). */
  async approve(orgId: string, id: string, actor: Actor): Promise<ContentItem | undefined> {
    const pending = await queryOne<ContentVersion>(
      `SELECT * FROM content_version WHERE org_id = $1 AND content_item_id = $2 AND status = 'pending' ORDER BY version DESC LIMIT 1`,
      [orgId, id],
    );
    if (!pending) {
      // Nothing staged — just approve the item in place.
      return queryOne<ContentItem>(`UPDATE content_item SET status='approved' WHERE org_id=$1 AND id=$2 RETURNING *`, [orgId, id]);
    }
    const updated = await queryOne<ContentItem>(
      `UPDATE content_item SET name=$3, description=$4, body=$5, trigger=$6, status='approved',
              version = $7, updated_at = now() WHERE org_id=$1 AND id=$2 RETURNING *`,
      [orgId, id, pending.name, pending.description, pending.body, pending.trigger, pending.version],
    );
    await query(`UPDATE content_version SET status='approved', actor_id=$3 WHERE id=$1 AND org_id=$2`, [pending.id, orgId, actor.userId]);
    return updated ?? undefined;
  }

  /** Restores a prior version as a new approved version (admin). */
  async rollback(orgId: string, id: string, version: number, actor: Actor): Promise<ContentItem | undefined> {
    const v = await queryOne<ContentVersion>(
      'SELECT * FROM content_version WHERE org_id = $1 AND content_item_id = $2 AND version = $3',
      [orgId, id, version],
    );
    if (!v) return undefined;
    const updated = await queryOne<ContentItem>(
      `UPDATE content_item SET name=$3, description=$4, body=$5, trigger=$6, status='approved',
              version = version + 1, updated_at = now() WHERE org_id=$1 AND id=$2 RETURNING *`,
      [orgId, id, v.name, v.description, v.body, v.trigger],
    );
    if (updated) await this.snapshot(updated, 'approved', actor);
    return updated ?? undefined;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await query('DELETE FROM content_item WHERE org_id = $1 AND id = $2', [orgId, id]);
  }
}
