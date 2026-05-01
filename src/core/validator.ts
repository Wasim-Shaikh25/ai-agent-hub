import Ajv, { ValidateFunction } from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationError } from './types';

/** Schema types that the Validator can validate against. */
export type SchemaType = 'skill' | 'rule' | 'hook' | 'tool' | 'agent-target';

const SCHEMA_TYPES: readonly SchemaType[] = [
  'skill',
  'rule',
  'hook',
  'tool',
  'agent-target',
];

/**
 * JSON Schema validator backed by Ajv.
 *
 * Loads schemas from the `schemas/` directory at construction
 * time and exposes a `validate` method that returns an array
 * of {@link ValidationError} objects.
 */
export class Validator {
  private readonly ajv: Ajv;
  private readonly schemas: Map<SchemaType, boolean>;

  constructor(extensionPath: string) {
    this.ajv = new Ajv({ allErrors: true });
    this.schemas = new Map();

    for (const type of SCHEMA_TYPES) {
      const schemaPath = path.join(
        extensionPath,
        'schemas',
        `${type}.schema.json`,
      );
      if (fs.existsSync(schemaPath)) {
        try {
          const schema: object = JSON.parse(
            fs.readFileSync(schemaPath, 'utf-8'),
          );
          this.ajv.addSchema(schema, type);
          this.schemas.set(type, true);
        } catch (err) {
          console.warn(
            `Validator: failed to load schema "${type}": ${String(err)}`,
          );
        }
      } else {
        console.warn(
          `Validator: schema file not found: ${schemaPath}`,
        );
      }
    }
  }

  /**
   * Validates `data` against the schema for `type`.
   *
   * @returns An empty array when the data is valid or the
   *          schema is not loaded. A non-empty array of
   *          {@link ValidationError} objects otherwise.
   */
  validate(type: SchemaType, data: unknown): ValidationError[] {
    const validate: ValidateFunction | undefined =
      this.ajv.getSchema(type);

    if (!validate) {
      // Schema was not loaded — skip validation gracefully.
      return [];
    }

    const valid = validate(data);
    if (valid) {
      return [];
    }

    return (validate.errors ?? []).map((err) => ({
      path: err.instancePath || '/',
      message: err.message ?? 'Unknown validation error',
    }));
  }
}
