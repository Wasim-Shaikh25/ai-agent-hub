import { z, type ZodRawShape, type ZodTypeAny } from 'zod';

/**
 * Minimal JSON-Schema → Zod raw-shape converter for proxying downstream MCP
 * tool input schemas. Handles the common object-with-typed-properties case;
 * unknown shapes fall back to `z.any()`.
 */
export function jsonSchemaToZodShape(schema: unknown): ZodRawShape {
  const shape: ZodRawShape = {};
  const s = schema as { type?: string; properties?: Record<string, unknown>; required?: string[] } | undefined;
  if (!s || s.type !== 'object' || !s.properties) return shape;

  const required = new Set(s.required ?? []);
  for (const [key, rawProp] of Object.entries(s.properties)) {
    const prop = rawProp as { type?: string; description?: string };
    let zt: ZodTypeAny;
    switch (prop.type) {
      case 'string': zt = z.string(); break;
      case 'number':
      case 'integer': zt = z.number(); break;
      case 'boolean': zt = z.boolean(); break;
      case 'array': zt = z.array(z.any()); break;
      case 'object': zt = z.record(z.any()); break;
      default: zt = z.any();
    }
    if (prop.description) zt = zt.describe(prop.description);
    if (!required.has(key)) zt = zt.optional();
    shape[key] = zt;
  }
  return shape;
}
