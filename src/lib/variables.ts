import { nanoid } from 'nanoid';
import type { EnvironmentRecord, EnvironmentVariable } from '@/types/storage';

export type VariableSource =
  | 'environment'
  | 'collection'
  | 'global'
  | 'dynamic'
  | 'unresolved';

export interface ResolvedVariableInfo {
  name: string;
  value?: string;
  source: VariableSource;
  isSecret: boolean;
}

export interface VariableResolutionContext {
  activeEnvironment?: EnvironmentRecord;
  globalEnvironment?: EnvironmentRecord;
  collectionVariables?: EnvironmentVariable[];
}

export interface VariableLookupMap {
  [key: string]: {
    value: string;
    source: 'environment' | 'collection' | 'global';
    isSecret: boolean;
  };
}

const VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_$.-]+)\}\}/g;

export function buildVariableLookupMap(
  context: VariableResolutionContext,
): VariableLookupMap {
  const map: VariableLookupMap = {};

  const applyLayer = (
    vars: EnvironmentVariable[] | undefined,
    source: 'environment' | 'collection' | 'global',
  ) => {
    if (!vars) return;
    for (const item of vars) {
      if (!item.enabled) continue;
      const key = item.key.trim();
      if (!key) continue;
      map[key] = {
        value: item.value,
        source,
        isSecret: item.isSecret,
      };
    }
  };

  // Precedence: Active Environment > Collection > Global
  applyLayer(context.globalEnvironment?.variables, 'global');
  applyLayer(context.collectionVariables, 'collection');
  if (context.activeEnvironment && !context.activeEnvironment.isGlobal) {
    applyLayer(context.activeEnvironment.variables, 'environment');
  }

  return map;
}

export function resolveDynamicVariable(name: string): string | undefined {
  switch (name) {
    case '$uuid':
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return `rift-${nanoid(12)}`;
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));
    case '$isoTimestamp':
      return new Date().toISOString();
    case '$randomInt':
      return String(Math.floor(Math.random() * 10000));
    default:
      return undefined;
  }
}

export function resolveSingleVariable(
  name: string,
  lookup: VariableLookupMap,
): ResolvedVariableInfo {
  if (name.startsWith('$')) {
    const dyn = resolveDynamicVariable(name);
    if (dyn !== undefined) {
      return {
        name,
        value: dyn,
        source: 'dynamic',
        isSecret: false,
      };
    }
  }

  const found = lookup[name];
  if (found) {
    return {
      name,
      value: found.value,
      source: found.source,
      isSecret: found.isSecret,
    };
  }

  return {
    name,
    value: undefined,
    source: 'unresolved',
    isSecret: false,
  };
}

export function resolveVariables(
  input: string,
  context: VariableResolutionContext,
  maxDepth: number = 4,
): string {
  if (!input || !input.includes('{{')) return input;
  const lookup = buildVariableLookupMap(context);

  let current = input;
  for (let depth = 0; depth < maxDepth; depth++) {
    let replaced = false;
    const next = current.replace(VARIABLE_PATTERN, (fullMatch, name: string) => {
      const info = resolveSingleVariable(name, lookup);
      if (info.value !== undefined) {
        replaced = true;
        return info.value;
      }
      return fullMatch;
    });
    current = next;
    if (!replaced || !current.includes('{{')) break;
  }

  return current;
}

export function findVariableMatches(
  input: string,
  context: VariableResolutionContext,
): ResolvedVariableInfo[] {
  if (!input || !input.includes('{{')) return [];
  const lookup = buildVariableLookupMap(context);
  const seen = new Set<string>();
  const matches: ResolvedVariableInfo[] = [];

  for (const match of input.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    matches.push(resolveSingleVariable(name, lookup));
  }

  return matches;
}

export function stripSecretsFromVariables(
  variables: EnvironmentVariable[],
): EnvironmentVariable[] {
  return variables.map((item) =>
    item.isSecret ? { ...item, value: '' } : { ...item },
  );
}

export function stripSecretsForExport(
  environments: EnvironmentRecord[],
): EnvironmentRecord[] {
  return environments.map((env) => ({
    ...env,
    variables: stripSecretsFromVariables(env.variables),
  }));
}
