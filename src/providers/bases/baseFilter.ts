import { CachedMetadata, TFile, getAllTags } from 'obsidian';

export interface BaseFilter {
  or?: (BaseFilter | string)[];
  and?: (BaseFilter | string)[];
  not?: (BaseFilter | string)[];
}

export interface BaseView {
  name?: string;
  filters?: BaseFilter | string;
}

export interface BaseFile {
  filters?: BaseFilter | string;
  views?: BaseView[];
}

export interface BaseFilterContext {
  getFileCache(file: TFile): CachedMetadata | null;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function getFolderPath(file: TFile): string {
  const normalized = normalizePath(file.path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitArgs(args: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let depth = 0;

  for (let i = 0; i < args.length; i++) {
    const char = args[i];
    if ((char === '"' || char === "'") && args[i - 1] !== '\\') {
      quote = quote === char ? null : quote || char;
    }

    if (!quote) {
      if (char === '(' || char === '[' || char === '{') depth++;
      if (char === ')' || char === ']' || char === '}') depth--;
      if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function splitOutsideQuotes(statement: string, operator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < statement.length; i++) {
    const char = statement[i];
    if ((char === '"' || char === "'") && statement[i - 1] !== '\\') {
      quote = quote === char ? null : quote || char;
    }

    if (!quote && statement.slice(i, i + operator.length) === operator) {
      parts.push(current.trim());
      current = '';
      i += operator.length - 1;
      continue;
    }

    current += char;
  }

  parts.push(current.trim());
  return parts.length > 1 ? parts : [statement.trim()];
}

function fileIsInFolder(file: TFile, folder: string): boolean {
  const target = normalizePath(folder);
  const fileFolder = getFolderPath(file);
  if (target === '') return fileFolder === '';
  return fileFolder === target || fileFolder.startsWith(`${target}/`);
}

function getFileProperty(file: TFile, property: string): unknown {
  switch (property) {
    case 'ext':
      return file.extension;
    case 'folder':
      return getFolderPath(file);
    case 'name':
      return file.name;
    case 'basename':
      return file.basename;
    case 'path':
      return normalizePath(file.path);
    default:
      return undefined;
  }
}

function parseLiteral(value: string): unknown {
  const trimmed = value.trim();
  const stripped = stripQuotes(trimmed);
  if (trimmed === 'today()') return new Date().toISOString().slice(0, 10);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return stripped;
}

function normalizeComparableValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const date = Date.parse(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(date)) {
      return date;
    }
  }
  return value;
}

function compareValues(left: unknown, operator: string, right: unknown): boolean {
  const normalizedLeft = normalizeComparableValue(left);
  const normalizedRight = normalizeComparableValue(right);

  if (operator === '==') return normalizedLeft === normalizedRight;
  if (operator === '!=') return normalizedLeft !== normalizedRight;
  if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
    if (operator === '>') return normalizedLeft > normalizedRight;
    if (operator === '>=') return normalizedLeft >= normalizedRight;
    if (operator === '<') return normalizedLeft < normalizedRight;
    if (operator === '<=') return normalizedLeft <= normalizedRight;
  }
  return false;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function toSearchableString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && 'path' in value) {
    const path = (value as { path?: unknown }).path;
    return typeof path === 'string' ? path : null;
  }
  return null;
}

function valueContains(left: unknown, right: unknown): boolean {
  if (Array.isArray(left)) {
    return (left as unknown[]).some(item => {
      const itemValue = toSearchableString(item) ?? item;
      if (compareValues(itemValue, '==', right)) return true;
      if (typeof itemValue === 'string' && typeof right === 'string') {
        return itemValue === `#${right}` || `#${itemValue}` === right;
      }
      return false;
    });
  }

  const leftString = toSearchableString(left);
  const rightString = toSearchableString(right);
  if (leftString !== null && rightString !== null) {
    return leftString.includes(rightString);
  }

  return false;
}

function valuesContainAny(left: unknown, values: unknown[]): boolean {
  return values.some(value => valueContains(left, value));
}

function valuesContainAll(left: unknown, values: unknown[]): boolean {
  return values.every(value => valueContains(left, value));
}

function getPropertyValue(
  expression: string,
  file: TFile,
  cache: CachedMetadata | null
): unknown {
  const metadata: Record<string, unknown> = cache?.frontmatter || {};
  const trimmed = expression.trim();

  if (trimmed.startsWith('file.')) {
    if (trimmed === 'file.tags') {
      return getAllTags(cache || {}) || [];
    }
    if (trimmed === 'file.links') {
      return [...(cache?.links ?? []), ...(cache?.frontmatterLinks ?? [])].map(link => link.link);
    }
    if (trimmed === 'file.properties') {
      return cache?.frontmatter || {};
    }
    return getFileProperty(file, trimmed.slice('file.'.length));
  }

  const noteBracketMatch = trimmed.match(/^note\[(["'][^"']+["'])\]$/);
  if (noteBracketMatch) {
    return metadata[stripQuotes(noteBracketMatch[1])];
  }

  return metadata[trimmed.replace(/^note\./, '')];
}

export function combineBaseFilters(
  baseData: BaseFile,
  viewIndex = 0
): BaseFilter | string | null {
  const filters = [baseData.filters, baseData.views?.[viewIndex]?.filters].filter(
    (filter): filter is BaseFilter | string => !!filter
  );

  if (filters.length === 0) return null;
  if (filters.length === 1) return filters[0];
  return { and: filters };
}

export function evaluateBaseFilterString(
  statement: string,
  file: TFile,
  context: BaseFilterContext
): boolean {
  const trimmed = statement.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  const orParts = splitOutsideQuotes(trimmed, '||');
  if (orParts.length > 1) return orParts.some(part => evaluateBaseFilterString(part, file, context));

  const andParts = splitOutsideQuotes(trimmed, '&&');
  if (andParts.length > 1) {
    return andParts.every(part => evaluateBaseFilterString(part, file, context));
  }

  if (trimmed.startsWith('!')) {
    return !evaluateBaseFilterString(trimmed.slice(1), file, context);
  }

  const cache = context.getFileCache(file);
  const tags = getAllTags(cache || {}) || [];

  const tagMatch = trimmed.match(/^file\.hasTag\((.+)\)$/);
  if (tagMatch) {
    const targetTags = splitArgs(tagMatch[1]).map(arg => stripQuotes(arg));
    return targetTags.some(tag => tags.some(t => t === tag || t === `#${tag}`));
  }

  const inFolderMatch = trimmed.match(/^file\.inFolder\((["'][^"']+["'])\)$/);
  if (inFolderMatch) {
    return fileIsInFolder(file, stripQuotes(inFolderMatch[1]));
  }

  const hasPropertyMatch = trimmed.match(/^file\.hasProperty\((["'][^"']+["'])\)$/);
  if (hasPropertyMatch) {
    const property = stripQuotes(hasPropertyMatch[1]);
    return !isEmptyValue((cache?.frontmatter || {})[property]);
  }

  const hasLinkMatch = trimmed.match(/^file\.hasLink\((["'][^"']+["'])\)$/);
  if (hasLinkMatch) {
    const target = stripQuotes(hasLinkMatch[1]);
    const links = [...(cache?.links ?? []), ...(cache?.frontmatterLinks ?? [])];
    return links.some(link => link.link === target || normalizePath(link.link) === normalizePath(target));
  }

  const containsMatch = trimmed.match(/^file\.folder\.contains\((["'][^"']+["'])\)$/);
  if (containsMatch) {
    return getFolderPath(file).includes(stripQuotes(containsMatch[1]));
  }

  const methodMatch = trimmed.match(/^(.+)\.(contains|containsAny|containsAll|isEmpty)\((.*)\)$/);
  if (methodMatch) {
    const [, expression, method, rawArgs] = methodMatch;
    const left = getPropertyValue(expression, file, cache);
    if (method === 'isEmpty') {
      return isEmptyValue(left);
    }
    const args = splitArgs(rawArgs);
    const values = args.map(arg => parseLiteral(arg));
    if (method === 'containsAll') {
      return valuesContainAll(left, values);
    }
    if (method === 'containsAny') {
      return valuesContainAny(left, values);
    }
    return values.some(value => valueContains(left, value));
  }

  const startsWithMatch = trimmed.match(/^file\.(folder|path|name|basename)\.startsWith\((["'][^"']+["'])\)$/);
  if (startsWithMatch) {
    const value = getFileProperty(file, startsWithMatch[1]);
    return typeof value === 'string' && value.startsWith(stripQuotes(startsWithMatch[2]));
  }

  const comparisonMatch = trimmed.match(
    /^(file\.(?:ext|folder|name|basename|path)|note\[[^\]]+\]|(?:note\.)?[\w -]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/
  );
  if (comparisonMatch) {
    const [, property, operator, rawRight] = comparisonMatch;
    const left = getPropertyValue(property, file, cache);
    return compareValues(left, operator, parseLiteral(rawRight.trim()));
  }

  return false;
}

export function evaluateBaseFilter(
  filter: BaseFilter | string,
  file: TFile,
  context: BaseFilterContext
): boolean {
  if (typeof filter === 'string') {
    return evaluateBaseFilterString(filter, file, context);
  }
  if (filter.or) return filter.or.some(f => evaluateBaseFilter(f, file, context));
  if (filter.and) return filter.and.every(f => evaluateBaseFilter(f, file, context));
  if (filter.not) return !filter.not.some(f => evaluateBaseFilter(f, file, context));
  return true;
}
