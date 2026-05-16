import { CachedMetadata, TFile, getAllTags } from 'obsidian';

export interface BaseFilter {
  or?: (BaseFilter | string)[];
  and?: (BaseFilter | string)[];
  not?: (BaseFilter | string)[];
}

export interface BaseView {
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
    case 'path':
      return normalizePath(file.path);
    default:
      return undefined;
  }
}

function parseLiteral(value: string): unknown {
  const stripped = stripQuotes(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return stripped;
}

function compareValues(left: unknown, operator: string, right: unknown): boolean {
  if (operator === '==') return left === right;
  if (operator === '!=') return left !== right;
  if (typeof left === 'number' && typeof right === 'number') {
    if (operator === '>') return left > right;
    if (operator === '>=') return left >= right;
    if (operator === '<') return left < right;
    if (operator === '<=') return left <= right;
  }
  return false;
}

export function combineBaseFilters(baseData: BaseFile): BaseFilter | string | null {
  const filters = [baseData.filters, baseData.views?.[0]?.filters].filter(
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

  const tagMatch = trimmed.match(/^file\.hasTag\((["'][^"']+["'])\)$/);
  if (tagMatch) {
    const tag = stripQuotes(tagMatch[1]);
    return tags.some(t => t === tag || t === `#${tag}`);
  }

  const inFolderMatch = trimmed.match(/^file\.inFolder\((["'][^"']+["'])\)$/);
  if (inFolderMatch) {
    return fileIsInFolder(file, stripQuotes(inFolderMatch[1]));
  }

  const containsMatch = trimmed.match(/^file\.folder\.contains\((["'][^"']+["'])\)$/);
  if (containsMatch) {
    return getFolderPath(file).includes(stripQuotes(containsMatch[1]));
  }

  const startsWithMatch = trimmed.match(/^file\.(folder|path)\.startsWith\((["'][^"']+["'])\)$/);
  if (startsWithMatch) {
    const value = getFileProperty(file, startsWithMatch[1]);
    return typeof value === 'string' && value.startsWith(stripQuotes(startsWithMatch[2]));
  }

  const comparisonMatch = trimmed.match(
    /^(file\.(?:ext|folder|name|path)|(?:note\.)?[\w -]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/
  );
  if (comparisonMatch) {
    const [, property, operator, rawRight] = comparisonMatch;
    const metadata: Record<string, unknown> = cache?.frontmatter || {};
    const left = property.startsWith('file.')
      ? getFileProperty(file, property.slice('file.'.length))
      : metadata[property.replace(/^note\./, '')];
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
