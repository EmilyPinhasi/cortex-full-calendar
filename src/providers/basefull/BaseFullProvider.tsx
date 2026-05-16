import { TFile, normalizePath, parseYaml } from 'obsidian';
import * as React from 'react';
import { DateTime } from 'luxon';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { CalendarInfo, EventLocation, OFCEvent, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { modifyFrontmatterString } from '../fullnote/frontmatter';
import { BaseFullConfigComponent, BaseFullConfigComponentProps } from './BaseFullConfigComponent';
import { buildNoteFromTemplate } from '../../utils/noteTemplate';
import { BaseFile, BaseFilter, combineBaseFilters, evaluateBaseFilter } from '../bases/baseFilter';

export interface BaseFullProviderConfig {
  type: 'basefull';
  id?: string;
  basePath: string;
  createDirectory: string;
  dateProperty: string;
  statusProperty?: string;
  completeStatusValue?: string;
  incompleteStatusValue?: string;
  color: string;
  name: string;
  newNoteTemplatePath?: string;
}

const DEFAULT_DATE_PROPERTY = 'date';
const DEFAULT_COMPLETE_STATUS = 'done';
const DEFAULT_INCOMPLETE_STATUS = 'todo';
const SUFFIX_PATTERN = '-_-_-';

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
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
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

  constructor(config: BaseFullProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('BaseFullProvider requires an Obsidian app interface.');
    }
    this.config = config;
    this.plugin = plugin;
    this.app = app;
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

  private async getFilteredFiles(): Promise<TFile[]> {
    const baseData = await this.getBaseData();
    if (!baseData) return [];

    const baseFilter = combineBaseFilters(baseData);
    return this.plugin.app.vault.getFiles().filter(file => {
      if (file.extension !== 'md') return false;
      if (!baseFilter) return true;
      return this.evaluateFilter(baseFilter, file);
    });
  }

  async getEvents(_range?: {
    start: Date;
    end: Date;
  }): Promise<[OFCEvent, EventLocation | null][]> {
    const events: [OFCEvent, EventLocation | null][] = [];
    for (const file of await this.getFilteredFiles()) {
      const eventData = this.getEventFromFile(file);
      if (eventData) {
        events.push(eventData);
      }
    }
    return events;
  }

  async getEventsInFile(file: TFile): Promise<[OFCEvent, EventLocation | null][]> {
    if (!this.isFileRelevant(file)) return [];
    const baseData = await this.getBaseData();
    if (!baseData) return [];
    const baseFilter = combineBaseFilters(baseData);
    if (baseFilter && !this.evaluateFilter(baseFilter, file)) return [];
    const event = this.getEventFromFile(file);
    return event ? [event] : [];
  }

  isFileRelevant(file: TFile): boolean {
    if (file.extension !== 'md') return false;
    return true;
  }

  private getEventFromFile(file: TFile): [OFCEvent, EventLocation | null] | null {
    const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!metadata) return null;

    const date =
      toDateString(metadata[this.dateProperty]) ||
      toDateString(metadata.date) ||
      toDateString(metadata.start) ||
      toDateString(metadata.startTime) ||
      toDateString(metadata.due);
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
      ...metadata,
      title: typeof metadata.title === 'string' ? metadata.title : file.basename,
      type: typeof metadata.type === 'string' ? metadata.type : 'single',
      allDay: typeof metadata.allDay === 'boolean' ? metadata.allDay : true,
      date,
      completed
    };

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
            {base.dateProperty || DEFAULT_DATE_PROPERTY}
            {base.statusProperty ? ` / ${base.statusProperty}` : ''}
          </span>
        </div>
      );
    };
  }
}
