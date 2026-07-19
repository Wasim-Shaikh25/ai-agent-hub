import { query, queryOne } from '../db/pool.js';

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
  version: number;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** CRUD + queries for the content registry (skills/rules/hooks/…). */
export class ContentService {
  list(orgId: string, type?: ContentType): Promise<ContentItem[]> {
    if (type) {
      return query<ContentItem>(
        'SELECT * FROM content_item WHERE org_id = $1 AND type = $2 ORDER BY type, name',
        [orgId, type],
      );
    }
    return query<ContentItem>(
      'SELECT * FROM content_item WHERE org_id = $1 ORDER BY type, name',
      [orgId],
    );
  }

  listEnabled(orgId: string, type?: ContentType): Promise<ContentItem[]> {
    if (type) {
      return query<ContentItem>(
        'SELECT * FROM content_item WHERE org_id = $1 AND type = $2 AND enabled = true ORDER BY type, name',
        [orgId, type],
      );
    }
    return query<ContentItem>(
      'SELECT * FROM content_item WHERE org_id = $1 AND enabled = true ORDER BY type, name',
      [orgId],
    );
  }

  async create(
    orgId: string,
    input: { type: ContentType; name: string; description?: string; body?: string; trigger?: string; enabled?: boolean },
  ): Promise<ContentItem> {
    const slug = slugify(input.name);
    const row = await queryOne<ContentItem>(
      `INSERT INTO content_item (org_id, type, slug, name, description, body, trigger, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (org_id, type, slug)
       DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
                     body = EXCLUDED.body, trigger = EXCLUDED.trigger,
                     enabled = EXCLUDED.enabled, version = content_item.version + 1,
                     updated_at = now()
       RETURNING *`,
      [
        orgId,
        input.type,
        slug,
        input.name,
        input.description ?? '',
        input.body ?? '',
        input.trigger ?? null,
        input.enabled ?? true,
      ],
    );
    return row!;
  }

  async update(orgId: string, id: string, fields: Partial<Pick<ContentItem, 'name' | 'description' | 'body' | 'enabled' | 'trigger'>>): Promise<ContentItem | undefined> {
    return queryOne<ContentItem>(
      `UPDATE content_item
          SET name = COALESCE($3, name),
              description = COALESCE($4, description),
              body = COALESCE($5, body),
              enabled = COALESCE($6, enabled),
              trigger = COALESCE($7, trigger),
              version = version + 1,
              updated_at = now()
        WHERE org_id = $1 AND id = $2
        RETURNING *`,
      [orgId, id, fields.name ?? null, fields.description ?? null, fields.body ?? null, fields.enabled ?? null, fields.trigger ?? null],
    );
  }

  async remove(orgId: string, id: string): Promise<void> {
    await query('DELETE FROM content_item WHERE org_id = $1 AND id = $2', [orgId, id]);
  }
}
