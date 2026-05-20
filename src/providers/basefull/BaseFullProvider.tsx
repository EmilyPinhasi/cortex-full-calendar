import { TFile, normalizePath, parseYaml } from 'obsidian';
import * as React from 'react';
import { DateTime } from 'luxon';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { CalendarInfo, EventLocation, OFCEvent, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { PluginState } from '../../core/PluginState';
import { modifyFrontmatterString } from '../fullnote/frontmatter';
import { BaseFullConfigComponent, BaseFullConfigComponentProps } from './BaseFullConfigComponent';
import { buildNoteFromTemplate } from '../../utils/noteTemplate';
import { BaseFile, BaseFilter, combineBaseFilters, evaluateBaseFilter } from '../bases/baseFilter';
import { GoogleAuthManager } from '../google/auth/GoogleAuthManager';
import { makeAuthenticatedRequest } from '../google/auth/request';
import { GoogleTasksProviderConfig } from '../googletasks/typesGoogleTasks';
import {
  GoogleTaskLike,
  fromGoogleTask,
  toGoogleTaskInsert,
  toGoogleTaskPatch
} from '../googletasks/parser/parser_google_tasks';
import { fetchGoogleTasks } from '../googletasks/auth/api';

type ExecFile = (
  file: string,
  args: string[],
  options: { cwd?: string; windowsHide?: boolean; timeout?: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void
) => void;

export interface BaseFullProviderConfig {
  type: 'basefull';
  id?: string;
  basePath: string;
  baseViewIndex?: number;
  createDirectory: string;
  dateProperty: string;
  statusProperty?: string;
  completeStatusValue?: string;
  incompleteStatusValue?: string;
  baseQueryMode?: 'auto' | 'cli' | 'parser';
  googleTasksSyncEnabled?: boolean;
  color: string;
  name: string;
  newNoteTemplatePath?: string;
}

export interface BaseFullUndatedItem {
  path: string;
  title: string;
  status: string | null;
  completed: boolean;
  due: string | null;
}

const DEFAULT_DATE_PROPERTY = 'date';
const DEFAULT_COMPLETE_STATUS = 'done';
const DEFAULT_INCOMPLETE_STATUS = 'todo';
const SUFFIX_PATTERN = '-_-_-';
const CLI_QUERY_TIMEOUT_MS = 10_000;
const CLI_RETRY_DELAY_MS = 30_000;
const GOOGLE_TASKS_LIST_PROPERTY = 'gTasksList';
const GOOGLE_TASK_URL_PROPERTY = 'gTaskUrl';
const GOOGLE_TASK_ID_PROPERTY = 'gTaskId';
const GOOGLE_TASK_SYNC_TAG = '#sync';

function sanitizeTitleForFilename(title: string): string {
  return title
    .replace(/[\\/:"*?<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findUniquePath(app: ObsidianInterface, directory: string, baseFilename: string): string {
  let path = normalizePath(`${directory}/${baseFilename}.md`);
  if (!app.getAbstractFileByPath(path)) {
    return path;
  }

  let i = 1;
  while (true) {
    path = normalizePath(`${directory}/${baseFilename}${SUFFIX_PATTERN}${i}.md`);
    if (!app.getAbstractFileByPath(path)) {
      return path;
    }
    i++;
  }
}

function getExecFile(): ExecFile | null {
  const maybeRequire = (window as unknown as { require?: (moduleName: string) => unknown }).require;
  if (!maybeRequire) return null;

  try {
    const childProcess = maybeRequire('child_process') as { execFile?: ExecFile };
    return typeof childProcess.execFile === 'function' ? childProcess.execFile : null;
  } catch {
    return null;
  }
}

function parseCliPathOutput(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^["']|["']$/g, ''))
    .map(path => normalizePath(path));
}

function toDateString(value: unknown): string | null {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function toComparableString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const values = value
      .map(item => toComparableString(item))
      .filter((item): item is string => item !== null);
    return values.length > 0 ? values.join(', ') : null;
  }
  return null;
}

function metadataCompletedValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().length > 0;
  return value === null || value === undefined ? null : Boolean(value);
}

function statusMatches(value: string | null, expected: string): boolean {
  return value?.trim().toLowerCase() === expected.trim().toLowerCase();
}

function toCalendarEventType(value: unknown): 'single' | 'recurring' | 'rrule' {
  if (value === 'recurring' || value === 'rrule') {
    return value;
  }
  return 'single';
}

function copyStringField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: string
): void {
  if (typeof source[field] === 'string') {
    target[field] = source[field];
  }
}

function copyBooleanField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: string
): void {
  if (typeof source[field] === 'boolean') {
    target[field] = source[field];
  }
}

function copyNumberField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: string
): void {
  if (typeof source[field] === 'number') {
    target[field] = source[field];
  }
}

function copyStringArrayField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: string
): void {
  if (Array.isArray(source[field]) && source[field].every(value => typeof value === 'string')) {
    target[field] = source[field];
  }
}

function copyDisplayField(target: Record<string, unknown>, source: Record<string, unknown>): void {
  const validDisplays = new Set([
    'auto',
    'block',
    'list-item',
    'background',
    'inverse-background',
    'none'
  ]);
  if (typeof source.display === 'string' && validDisplays.has(source.display)) {
    target.display = source.display;
  }
}

function copyRepeatOnField(target: Record<string, unknown>, source: Record<string, unknown>): void {
  const repeatOn = source.repeatOn;
  if (
    repeatOn &&
    typeof repeatOn === 'object' &&
    typeof (repeatOn as { week?: unknown }).week === 'number' &&
    typeof (repeatOn as { weekday?: unknown }).weekday === 'number'
  ) {
    target.repeatOn = repeatOn;
  }
}

function copyNotifyField(target: Record<string, unknown>, source: Record<string, unknown>): void {
  const notify = source.notify;
  if (
    notify &&
    typeof notify === 'object' &&
    typeof (notify as { value?: unknown }).value === 'number'
  ) {
    target.notify = notify;
  }
}

function areFieldValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function getChangedEventFields(
  oldEventData: OFCEvent,
  newEventData: OFCEvent
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  const keys = new Set<keyof OFCEvent>([
    ...(Object.keys(oldEventData) as (keyof OFCEvent)[]),
    ...(Object.keys(newEventData) as (keyof OFCEvent)[])
  ]);

  keys.forEach(key => {
    if (key === 'uid') return;
    const oldValue = oldEventData[key];
    const newValue = newEventData[key];
    if (!areFieldValuesEqual(oldValue, newValue)) {
      changed[key as string] = newValue;
    }
  });

  return changed;
}

function getStringMetadata(metadata: Record<string, unknown>, property: string): string | null {
  const value = metadata[property];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getSingleEventDate(event: OFCEvent): string | null {
  if (event.type === 'single') return event.date;
  if (event.type === 'rrule') return event.startDate;
  return event.startRecur || null;
}

export class BaseFullProvider implements CalendarProvider<BaseFullProviderConfig>, SyncKeyProvider {
  static readonly type = 'basefull';
  static readonly displayName = 'Base Full';
  static getConfigurationComponent(): FCReactComponent<BaseFullConfigComponentProps> {
    return BaseFullConfigComponent;
  }

  readonly type = 'basefull';
  readonly displayName = 'Base Full';
  readonly isRemote = false;
  readonly loadPriority = 10;

  private config: BaseFullProviderConfig;
  private plugin: FullCalendarPlugin;
  private app: ObsidianInterface;
  private authManager: GoogleAuthManager;
  private cliQueryPromise: Promise<TFile[]> | null = null;
  private cliDisabledUntil = 0;
  private syncedGoogleTaskIds = new Set<string>();

  constructor(config: BaseFullProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('BaseFullProvider requires an Obsidian app interface.');
    }
    this.config = config;
    this.plugin = plugin;
    this.app = app;
    this.authManager = new GoogleAuthManager(plugin);
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  private get dateProperty(): string {
    return this.config.dateProperty || DEFAULT_DATE_PROPERTY;
  }

  private get completeStatusValue(): string {
    return this.config.completeStatusValue || DEFAULT_COMPLETE_STATUS;
  }

  private get incompleteStatusValue(): string {
    return this.config.incompleteStatusValue || DEFAULT_INCOMPLETE_STATUS;
  }

  private get baseQueryMode(): 'auto' | 'cli' | 'parser' {
    return this.config.baseQueryMode || 'auto';
  }

  private get googleTasksSyncEnabled(): boolean {
    return this.config.googleTasksSyncEnabled === true;
  }

  private getDateFromMetadata(metadata: Record<string, unknown>): string | null {
    return toDateString(metadata[this.dateProperty]);
  }

  private isBasesEnabled(): boolean {
    const app = this.plugin.app as unknown as {
      internalPlugins?: { getPluginById: (id: string) => unknown };
      plugins?: { getPlugin: (id: string) => unknown };
    };
    return !!(app.internalPlugins?.getPluginById('bases') || app.plugins?.getPlugin('bases'));
  }

  private evaluateFilter(filter: BaseFilter | string, file: TFile): boolean {
    return evaluateBaseFilter(filter, file, this.plugin.app.metadataCache);
  }

  private async getBaseData(): Promise<BaseFile | null> {
    if (!this.isBasesEnabled()) {
      console.warn('Bases plugin not found or disabled.');
      return null;
    }

    const baseFile = this.plugin.app.vault.getAbstractFileByPath(this.config.basePath);
    if (!(baseFile instanceof TFile)) {
      return null;
    }

    try {
      return parseYaml(await this.plugin.app.vault.read(baseFile)) as BaseFile;
    } catch (error) {
      console.warn('Failed to parse Base file as YAML', error);
      return null;
    }
  }

  private getSelectedViewName(baseData: BaseFile): string | null {
    const viewIndex = this.config.baseViewIndex ?? 0;
    const viewName = baseData.views?.[viewIndex]?.name;
    return typeof viewName === 'string' && viewName.trim().length > 0 ? viewName.trim() : null;
  }

  private getVaultBasePath(): string | null {
    const adapter = this.plugin.app.vault.adapter as { getBasePath?: () => string };
    return typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : null;
  }

  private async getCliFilteredFiles(baseData: BaseFile): Promise<TFile[] | null> {
    if (this.baseQueryMode === 'parser') return null;
    if (this.baseQueryMode === 'auto' && Date.now() < this.cliDisabledUntil) return null;
    if (this.cliQueryPromise) return this.cliQueryPromise;

    const execFile = getExecFile();
    const vaultBasePath = this.getVaultBasePath();
    const viewName = this.getSelectedViewName(baseData);
    if (!execFile || !vaultBasePath || !viewName) {
      return null;
    }

    const args = [
      'base:query',
      `path=${this.config.basePath}`,
      `view=${viewName}`,
      'format=paths'
    ];

    this.cliQueryPromise = new Promise<TFile[]>((resolve, reject) => {
      execFile(
        'obsidian',
        args,
        { cwd: vaultBasePath, windowsHide: true, timeout: CLI_QUERY_TIMEOUT_MS },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message));
            return;
          }

          const files = parseCliPathOutput(stdout)
            .map(path => this.app.getFileByPath(path))
            .filter((file): file is TFile => file instanceof TFile && file.extension === 'md');
          resolve(files);
        }
      );
    }).finally(() => {
      this.cliQueryPromise = null;
    });

    try {
      return await this.cliQueryPromise;
    } catch (error) {
      this.cliDisabledUntil =
        this.baseQueryMode === 'auto' ? Date.now() + CLI_RETRY_DELAY_MS : this.cliDisabledUntil;
      console.warn('Base Full: Obsidian CLI base:query failed; falling back to parser.', error);
      if (this.baseQueryMode === 'cli') {
        throw error;
      }
      return null;
    }
  }

  private getParserFilteredFiles(baseData: BaseFile): TFile[] {
    const baseFilter = combineBaseFilters(baseData, this.config.baseViewIndex);
    return this.plugin.app.vault.getFiles().filter(file => {
      if (file.extension !== 'md') return false;
      if (!baseFilter) return true;
      return this.evaluateFilter(baseFilter, file);
    });
  }

  private async getFilteredFiles(): Promise<TFile[]> {
    const baseData = await this.getBaseData();
    if (!baseData) return [];

    const cliFiles = await this.getCliFilteredFiles(baseData);
    return cliFiles || this.getParserFilteredFiles(baseData);
  }

  private getGoogleTasksSourceByName(listName: string): (GoogleTasksProviderConfig & CalendarInfo) | null {
    const normalizedListName = listName.trim().toLowerCase();
    return (
      PluginState.getSettings().calendarSources.find(
        (source): source is GoogleTasksProviderConfig & CalendarInfo =>
          source.type === 'googletasks' && source.name.trim().toLowerCase() === normalizedListName
      ) || null
    );
  }

  private async getGoogleTasksToken(source: GoogleTasksProviderConfig): Promise<string | null> {
    return this.authManager.getTokenForSource({
      type: 'google',
      id: source.id,
      name: source.name,
      calendarId: 'primary',
      googleAccountId: source.googleAccountId,
      color: ''
    });
  }

  private getObsidianNoteUrl(file: TFile): string {
    const vault = (this.plugin.app.vault as unknown as { getName?: () => string }).getName?.();
    if (!vault) {
      return `[[${file.path}]]`;
    }

    const params = new URLSearchParams({ vault, file: file.path });
    return `obsidian://open?${params.toString()}`;
  }

  private buildGoogleTaskNotes(event: OFCEvent, file: TFile): string {
    const existingDescription = event.description?.trim();
    const noteUrl = this.getObsidianNoteUrl(file);
    const parts = [GOOGLE_TASK_SYNC_TAG, `Obsidian: ${noteUrl}`];
    if (existingDescription && !existingDescription.includes(GOOGLE_TASK_SYNC_TAG)) {
      parts.push('', existingDescription);
    } else if (existingDescription) {
      parts.push('', existingDescription);
    }
    return Array.from(new Set(parts)).join('\n');
  }

  private async writeGoogleTaskLinkMetadata(
    file: TFile,
    task: GoogleTaskLike
  ): Promise<void> {
    const taskUrl = task.webViewLink || task.selfLink;
    const modifications: Record<string, unknown> = {
      [GOOGLE_TASK_ID_PROPERTY]: task.id
    };
    if (taskUrl) {
      modifications[GOOGLE_TASK_URL_PROPERTY] = taskUrl;
    }

    await this.app.rewrite(file, page => modifyFrontmatterString(page, modifications));
  }

  private async syncBaseEventToGoogle(
    file: TFile,
    metadata: Record<string, unknown>,
    event: OFCEvent
  ): Promise<void> {
    if (!this.googleTasksSyncEnabled) return;

    const listName = getStringMetadata(metadata, GOOGLE_TASKS_LIST_PROPERTY);
    if (!listName) return;

    const source = this.getGoogleTasksSourceByName(listName);
    if (!source) {
      console.warn(`Base Full: Google Tasks list "${listName}" is not configured as a source.`);
      return;
    }

    const token = await this.getGoogleTasksToken(source);
    if (!token) return;

    const date = getSingleEventDate(event);
    if (!date) return;

    const singleEvent = {
      ...event,
      type: 'single' as const,
      allDay: true as const,
      date,
      endDate: null,
      description: this.buildGoogleTaskNotes(event, file)
    };
    const existingTaskId = getStringMetadata(metadata, GOOGLE_TASK_ID_PROPERTY);
    const taskUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
      source.taskListId
    )}/tasks${existingTaskId ? `/${encodeURIComponent(existingTaskId)}` : ''}`;

    try {
      const task = await makeAuthenticatedRequest<GoogleTaskLike>(
        token,
        taskUrl,
        existingTaskId ? 'PATCH' : 'POST',
        existingTaskId ? toGoogleTaskPatch(singleEvent) : toGoogleTaskInsert(singleEvent)
      );
      this.syncedGoogleTaskIds.add(task.id);

      const currentTaskUrl = getStringMetadata(metadata, GOOGLE_TASK_URL_PROPERTY);
      if (task.id !== existingTaskId || (task.webViewLink || task.selfLink) !== currentTaskUrl) {
        await this.writeGoogleTaskLinkMetadata(file, task);
      }
    } catch (error) {
      console.error(`Base Full: failed to sync "${file.path}" to Google Tasks.`, error);
    }
  }

  private async createBaseNoteFromGoogleTask(
    source: GoogleTasksProviderConfig & CalendarInfo,
    task: GoogleTaskLike
  ): Promise<TFile | null> {
    if (!task.id || !task.notes?.includes(GOOGLE_TASK_SYNC_TAG)) {
      return null;
    }
    if (this.syncedGoogleTaskIds.has(task.id)) {
      return null;
    }

    const existing = this.plugin.app.vault.getFiles().find(file => {
      const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
      return getStringMetadata(metadata, GOOGLE_TASK_ID_PROPERTY) === task.id;
    });
    if (existing) {
      this.syncedGoogleTaskIds.add(task.id);
      return null;
    }

    const event = fromGoogleTask(task);
    const title = task.title || event?.title || 'Untitled task';
    const date = event?.type === 'single' ? event.date : null;
    const baseFilename = `${date ? `${date} ` : ''}${sanitizeTitleForFilename(title)}`;
    const path = findUniquePath(this.app, this.config.createDirectory, baseFilename);
    const frontmatter = this.mapEventFieldsToFrontmatter({
      ...(event || {
        type: 'single',
        title,
        allDay: true,
        completed: task.status === 'completed' ? task.completed || DateTime.now().toISO() : false
      }),
      [GOOGLE_TASKS_LIST_PROPERTY]: source.name,
      [GOOGLE_TASK_ID_PROPERTY]: task.id,
      [GOOGLE_TASK_URL_PROPERTY]: task.webViewLink || task.selfLink,
      description: task.notes
    });
    const file = await this.app.create(
      path,
      await buildNoteFromTemplate(this.app, this.config.newNoteTemplatePath, frontmatter)
    );
    this.syncedGoogleTaskIds.add(task.id);
    return file;
  }

  private async syncGoogleTasksToInbox(): Promise<void> {
    if (!this.googleTasksSyncEnabled) return;

    const sources = PluginState.getSettings().calendarSources.filter(
      (source): source is GoogleTasksProviderConfig & CalendarInfo => source.type === 'googletasks'
    );

    for (const source of sources) {
      const token = await this.getGoogleTasksToken(source);
      if (!token) continue;

      try {
        const tasks = await fetchGoogleTasks(token, source.taskListId);
        for (const task of tasks) {
          await this.createBaseNoteFromGoogleTask(source, task);
        }
      } catch (error) {
        console.error(`Base Full: failed to import Google Tasks list "${source.name}".`, error);
      }
    }
  }

  async getEvents(_range?: {
    start: Date;
    end: Date;
  }): Promise<[OFCEvent, EventLocation | null][]> {
    const events: [OFCEvent, EventLocation | null][] = [];
    for (const file of await this.getFilteredFiles()) {
      const eventData = this.getEventFromFile(file);
      if (eventData) {
        const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
        await this.syncBaseEventToGoogle(file, metadata, eventData[0]);
        events.push(eventData);
      }
    }
    await this.syncGoogleTasksToInbox();
    return events;
  }

  async getEventsInFile(file: TFile): Promise<[OFCEvent, EventLocation | null][]> {
    if (!this.isFileRelevant(file)) return [];
    const baseData = await this.getBaseData();
    if (!baseData) return [];

    const cliFiles = await this.getCliFilteredFiles(baseData);
    if (cliFiles) {
      if (!cliFiles.some(cliFile => cliFile.path === file.path)) return [];
    } else {
      const baseFilter = combineBaseFilters(baseData, this.config.baseViewIndex);
      if (baseFilter && !this.evaluateFilter(baseFilter, file)) return [];
    }

    const event = this.getEventFromFile(file);
    if (event) {
      const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
      await this.syncBaseEventToGoogle(file, metadata, event[0]);
    }
    return event ? [event] : [];
  }

  async getUndatedItems(): Promise<BaseFullUndatedItem[]> {
    const files = await this.getFilteredFiles();
    return files
      .map(file => {
        const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
        if (this.getDateFromMetadata(metadata)) {
          return null;
        }

        const rawStatus =
          this.config.statusProperty && metadata[this.config.statusProperty] !== undefined
            ? toComparableString(metadata[this.config.statusProperty])
            : toComparableString(metadata.status);
        const completed =
          statusMatches(rawStatus, this.completeStatusValue) ||
          metadataCompletedValue(metadata.completed) === true;
        const status =
          rawStatus ||
          (metadataCompletedValue(metadata.completed) !== null
            ? completed
              ? this.completeStatusValue
              : this.incompleteStatusValue
            : null);

        return {
          path: file.path,
          title: typeof metadata.title === 'string' ? metadata.title : file.basename,
          status,
          completed,
          due: toDateString(metadata.due)
        };
      })
      .filter((item): item is BaseFullUndatedItem => item !== null);
  }

  async scheduleUndatedItem(path: string, date: Date): Promise<void> {
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }

    const dateString = DateTime.fromJSDate(date).toISODate();
    if (!dateString) {
      throw new Error('Could not determine drop date.');
    }

    await this.app.rewrite(file, page =>
      modifyFrontmatterString(page, { [this.dateProperty]: dateString })
    );
  }

  isFileRelevant(file: TFile): boolean {
    if (file.extension !== 'md') return false;
    return true;
  }

  shouldRefreshAllOnFileUpdate(file: TFile): boolean {
    return file.path === this.config.basePath;
  }

  private getEventFromFile(file: TFile): [OFCEvent, EventLocation | null] | null {
    const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!metadata) return null;

    const date = this.getDateFromMetadata(metadata);
    if (!date) return null;

    const statusProperty = this.config.statusProperty;
    const statusValue =
      statusProperty && metadata[statusProperty] !== undefined
        ? toComparableString(metadata[statusProperty])
        : null;
    const completed: unknown =
      statusValue === null
        ? metadata.completed
        : statusValue === this.completeStatusValue
          ? typeof metadata.completed === 'string'
            ? metadata.completed
            : date
          : false;

    const rawEvent: Record<string, unknown> = {
      title: typeof metadata.title === 'string' ? metadata.title : file.basename,
      type: toCalendarEventType(metadata.type),
      allDay: typeof metadata.allDay === 'boolean' ? metadata.allDay : true,
      date,
      completed,
      hasSchedule: metadata.schedule !== undefined
    };

    [
      'id',
      'uid',
      'timezone',
      'etag',
      'category',
      'subCategory',
      'recurringEventId',
      'description',
      'url',
      'startTime',
      'endTime',
      'endDate',
      'startDate',
      'rrule',
      'startRecur',
      'endRecur'
    ].forEach(field => copyStringField(rawEvent, metadata, field));
    ['endReminder', 'isTask'].forEach(field => copyBooleanField(rawEvent, metadata, field));
    ['month', 'dayOfMonth', 'repeatInterval'].forEach(field =>
      copyNumberField(rawEvent, metadata, field)
    );
    ['daysOfWeek', 'skipDates'].forEach(field => copyStringArrayField(rawEvent, metadata, field));
    copyDisplayField(rawEvent, metadata);
    copyRepeatOnField(rawEvent, metadata);
    copyNotifyField(rawEvent, metadata);

    const event = validateEvent(rawEvent);
    if (!event) return null;

    event.uid = file.path;
    return [event, { file: { path: file.path }, lineNumber: undefined }];
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    return event.uid ? { persistentId: event.uid } : null;
  }

  computeSyncKey(event: OFCEvent): string {
    return event.uid || JSON.stringify(event);
  }

  private mapEventFieldsToFrontmatter(fields: Record<string, unknown>): Record<string, unknown> {
    const mapped = { ...fields };
    if ('date' in mapped) {
      mapped[this.dateProperty] = mapped.date;
      if (this.dateProperty !== 'date') {
        delete mapped.date;
      }
    }

    const statusProperty = this.config.statusProperty;
    if (statusProperty && 'completed' in mapped) {
      mapped[statusProperty] = mapped.completed
        ? this.completeStatusValue
        : this.incompleteStatusValue;
      delete mapped.completed;
    }

    return mapped;
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    const baseFilename = `${event.type === 'single' ? event.date : 'event'} ${sanitizeTitleForFilename(
      event.title
    )}`;
    const path = findUniquePath(this.app, this.config.createDirectory, baseFilename);
    const frontmatter = this.mapEventFieldsToFrontmatter({ ...event });
    const file = await this.app.create(
      path,
      await buildNoteFromTemplate(this.app, this.config.newNoteTemplatePath, frontmatter)
    );
    const finalEvent = { ...event, uid: file.path };
    return [finalEvent, { file, lineNumber: undefined }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const file = this.app.getFileByPath(handle.persistentId);
    if (!file) {
      throw new Error(`File ${handle.persistentId} not found.`);
    }

    const changedFields = this.mapEventFieldsToFrontmatter(
      getChangedEventFields(oldEventData, newEventData)
    );
    if (Object.keys(changedFields).length > 0) {
      await this.app.rewrite(file, page => modifyFrontmatterString(page, changedFields));
    }

    const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    await this.syncBaseEventToGoogle(file, { ...metadata, ...changedFields }, newEventData);

    return { file: { path: file.path }, lineNumber: undefined };
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const file = this.app.getFileByPath(handle.persistentId);
    if (!file) {
      throw new Error(`File ${handle.persistentId} not found.`);
    }
    await this.app.delete(file);
  }

  createInstanceOverride(
    _masterEvent: OFCEvent,
    _instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    return this.createEvent(newEventData);
  }

  getConfigurationComponent(): FCReactComponent<BaseFullConfigComponentProps> {
    return BaseFullConfigComponent;
  }

  getSettingsRowComponent(): FCReactComponent<{ source: Partial<CalendarInfo> }> {
    return ({ source }) => {
      const base = source as Partial<BaseFullProviderConfig>;
      return (
        <div className="setting-item-control">
          <span>{base.basePath}</span>
          <span className="fc-setting-desc">
            {base.baseViewIndex !== undefined ? `view ${base.baseViewIndex + 1} / ` : ''}
            {base.dateProperty || DEFAULT_DATE_PROPERTY}
            {base.statusProperty ? ` / ${base.statusProperty}` : ''}
            {base.googleTasksSyncEnabled ? ' / Google Tasks sync' : ''}
          </span>
        </div>
      );
    };
  }
}
