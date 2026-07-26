/**
 * Safe parser and validator for MCP server configuration values.
 *
 * Parses strings of the form:
 *   KEY=value KEY2="value with spaces" KEY3='another value'
 *
 * Keys must be valid POSIX-style identifiers. Values may contain spaces
 * when quoted. No shell interpolation is performed.
 */

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NPM_PACKAGE_NAME_REGEX = /^(?:@[A-Za-z0-9_-]+\/)?[A-Za-z0-9._-]+$/;

// Characters that could be interpreted by a shell or used to inject commands.
const UNSAFE_SHELL_CHAR = /[;&|$`()<>\\"'*?{}[\]!#\n\r]/;

export interface ParsedArgsResult {
  args: string[];
  errors: string[];
}

/**
 * Parses a space-separated argument string, respecting single and double quotes.
 * This allows values such as `--path="C:\Program Files\foo"` to remain one token.
 */
export function parseArgsString(raw: string): ParsedArgsResult {
  const args: string[] = [];
  const errors: string[] = [];

  let i = 0;
  const len = raw.length;

  while (i < len) {
    while (i < len && /\s/.test(raw[i])) {
      i++;
    }
    if (i >= len) {
      break;
    }

    let token = '';
    let unclosed = false;

    while (i < len && !/\s/.test(raw[i])) {
      const ch = raw[i];
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        const start = i;
        while (i < len && raw[i] !== quote) {
          i++;
        }
        token += raw.slice(start, i);
        if (i < len && raw[i] === quote) {
          i++;
        } else {
          unclosed = true;
        }
      } else {
        token += ch;
        i++;
      }
    }

    if (unclosed) {
      errors.push(`Unclosed quote in argument: "${token}"`);
    }
    if (token) {
      args.push(token);
    }
  }

  return { args, errors };
}

/**
 * Validates an npm package name. Allows scoped and unscoped names.
 */
export function isValidNpmPackageName(name: string): boolean {
  return NPM_PACKAGE_NAME_REGEX.test(name);
}

/**
 * Validates a single CLI argument token. Rejects shell metacharacters
 * and unprintable characters.
 */
export function isValidMcpArg(arg: string): boolean {
  if (!arg || arg.includes('\0')) {
    return false;
  }
  return !UNSAFE_SHELL_CHAR.test(arg);
}

/**
 * Validates the core fields of an MCP server configuration.
 */
export function validateMcpServerFields(
  name: string,
  packageName: string,
  args: string[],
  env: Record<string, string>,
): string[] {
  const errors: string[] = [];

  if (!name?.trim()) {
    errors.push('MCP server name is required');
  }
  if (!packageName?.trim()) {
    errors.push('Package name is required');
  } else if (!isValidNpmPackageName(packageName)) {
    errors.push(`Invalid package name: "${packageName}"`);
  }

  for (const arg of args) {
    if (!isValidMcpArg(arg)) {
      errors.push(`Unsafe argument: "${arg}"`);
    }
  }

  errors.push(...validateEnvRecord(env));

  return errors;
}

export interface ParsedEnvResult {
  env: Record<string, string>;
  errors: string[];
}

/**
 * Parses a KEY=VALUE string, respecting single and double quotes.
 */
export function parseEnvString(raw: string): ParsedEnvResult {
  const env: Record<string, string> = {};
  const errors: string[] = [];

  let i = 0;
  const len = raw.length;

  while (i < len) {
    // skip whitespace
    while (i < len && /\s/.test(raw[i])) {
      i++;
    }
    if (i >= len) {
      break;
    }

    // read key until '='
    const keyStart = i;
    while (i < len && raw[i] !== '=' && !/\s/.test(raw[i])) {
      i++;
    }
    const key = raw.slice(keyStart, i).trim();

    if (i >= len || raw[i] !== '=') {
      if (key) {
        errors.push(`Env entry "${key}" is missing a value`);
      }
      // consume token and continue
      continue;
    }
    i++; // skip '='

    let value = '';
    if (i < len && (raw[i] === '"' || raw[i] === "'")) {
      const quote = raw[i];
      i++;
      const valueStart = i;
      while (i < len && raw[i] !== quote) {
        i++;
      }
      value = raw.slice(valueStart, i);
      if (i < len && raw[i] === quote) {
        i++;
      } else {
        errors.push(`Env value for ${key} has unbalanced quotes`);
      }
    } else {
      const valueStart = i;
      while (i < len && !/\s/.test(raw[i])) {
        i++;
      }
      value = raw.slice(valueStart, i);
    }

    if (!ENV_KEY_REGEX.test(key)) {
      errors.push(`Invalid env key: "${key}"`);
      continue;
    }
    if (value.includes('\0')) {
      errors.push(`Env value for ${key} contains a null byte`);
      continue;
    }
    env[key] = value;
  }

  return { env, errors };
}

/**
 * Validates that a record of env vars has safe keys and values.
 */
export function validateEnvRecord(env: Record<string, string>): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_REGEX.test(key)) {
      errors.push(`Invalid env key: "${key}"`);
    }
    if (value.includes('\0')) {
      errors.push(`Env value for ${key} contains a null byte`);
    }
  }
  return errors;
}
