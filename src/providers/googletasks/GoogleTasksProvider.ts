import * as React from 'react';
import { DateTime } from 'luxon';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { EventLocation, OFCEvent, validateEvent } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { GoogleAuthManager } from '../google/auth/GoogleAuthManager';
import { GoogleApiError, makeAuthenticatedRequest } from '../google/auth/request';
import { fetchGoogleTasks } from './auth/api';
import {
  fromGoogleTask,
  GoogleTaskLike,
  toGoogleTaskInsert,
  toGoogleTaskPatch
} from './parser/parser_google_tasks';
import { GoogleTasksProviderConfig } from './typesGoogleTasks';
import { GoogleTasksConfigComponent } from './ui/GoogleTasksConfigComponent';

const GoogleTasksNameSetting: React.FC<{
  source: Partial<import('../../types').CalendarInfo>;
}> = ({ source }) => {
  const googleAccountId = (source as unknown as { googleAccountId?: string })?.googleAccountId;
  const accountEmail = PluginState.getSettings().googleAccounts.find(
    account => account.id === googleAccountId
  )?.email;
  const displayValue = accountEmail || '';

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: displayValue,
      className: 'fc-setting-input'
    })
  );
};

type GoogleTasksConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<GoogleTasksProviderConfig>;
  onConfigChange: (newConfig: Partial<GoogleTasksProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (
    finalConfig: GoogleTasksProviderConfig | GoogleTasksProviderConfig[],
    accountId?: string
  ) => void;
  onClose: () => void;
};

const createGoogleTasksConfigWrapper = (
  pluginFromInstance?: FullCalendarPlugin
): React.FC<GoogleTasksConfigProps> => {
  return props => {
    const plugin =
      pluginFromInstance ||
      (props as GoogleTasksConfigProps & { plugin?: FullCalendarPlugin }).plugin;

    const handleSave = (
      selectedConfigs: { id: string; name: string; color: string }[],
      accountId: string
    ) => {
      props.onSave(selectedConfigs as unknown as GoogleTasksProviderConfig[], accountId);
    };

    if (!plugin) {
      throw new Error('Google Tasks configuration requires plugin context.');
    }

    return React.createElement(GoogleTasksConfigComponent, {
      plugin,
      onSave: handleSave,
      onClose: props.onClose
    });
  };
};

export class GoogleTasksProvider
  implements CalendarProvider<GoogleTasksProviderConfig>, SyncKeyProvider
{
  static readonly type = 'googletasks';
  static readonly displayName = 'Google Tasks';

  static getConfigurationComponent(): FCReactComponent<GoogleTasksConfigProps> {
    return createGoogleTasksConfigWrapper();
  }

  readonly type = 'googletasks';
  readonly displayName = 'Google Tasks';
  readonly isRemote = true;
  readonly loadPriority = 126;

  private authManager: GoogleAuthManager;

  constructor(
    private source: GoogleTasksProviderConfig,
    private plugin: FullCalendarPlugin,
    _app?: ObsidianInterface
  ) {
    this.authManager = new GoogleAuthManager(plugin);
  }

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: true,
      canEdit: true,
      canDelete: true,
      contextMenu: {
        providesNativeTaskSemantics: true
      }
    };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    return event.uid ? { persistentId: event.uid } : null;
  }

  computeSyncKey(event: OFCEvent): string {
    return event.uid || JSON.stringify(event);
  }

  private async getAccessToken(): Promise<string> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: 'primary',
      googleAccountId: this.source.googleAccountId,
      color: ''
    });

    if (!token) {
      throw new GoogleApiError('Cannot perform Google Tasks operation: not authenticated.');
    }

    return token;
  }

  async getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]> {
    const token = await this.getAccessToken().catch(() => null);
    if (!token) return [];

    try {
      const tasks = await fetchGoogleTasks(token, this.source.taskListId, range);
      return tasks
        .map(task => {
          const parsed = fromGoogleTask(task);
          if (!parsed) return null;
          const validated = validateEvent(parsed);
          return validated ? ([validated, null] as [OFCEvent, EventLocation | null]) : null;
        })
        .filter((item): item is [OFCEvent, EventLocation | null] => item !== null);
    } catch (e) {
      console.error(`Error fetching Google Tasks list "${this.source.name}":`, e);
      return [];
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    if (event.type !== 'single') {
      throw new Error('Google Tasks can only create single dated tasks.');
    }

    const token = await this.getAccessToken();
    const created = await makeAuthenticatedRequest<GoogleTaskLike>(
      token,
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.taskListId)}/tasks`,
      'POST',
      toGoogleTaskInsert({ ...event, allDay: true })
    );

    const parsed = fromGoogleTask(created);
    if (!parsed) {
      throw new Error('Could not parse Google Task after creation.');
    }
    return [parsed, null];
  }

  async updateEvent(
    handle: EventHandle,
    _oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    if (newEventData.type !== 'single') {
      throw new Error('Google Tasks can only update single dated tasks.');
    }

    const token = await this.getAccessToken();
    await makeAuthenticatedRequest(
      token,
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
        this.source.taskListId
      )}/tasks/${encodeURIComponent(handle.persistentId)}`,
      'PATCH',
      toGoogleTaskPatch({ ...newEventData, allDay: true })
    );
    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const token = await this.getAccessToken();
    await makeAuthenticatedRequest(
      token,
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
        this.source.taskListId
      )}/tasks/${encodeURIComponent(handle.persistentId)}`,
      'DELETE'
    );
  }

  async toggleComplete(eventId: string, isDone: boolean): Promise<boolean> {
    try {
      const event = PluginState.getCache()?.getEventById(eventId);
      if (!event?.uid || event.type !== 'single') return false;

      const completed = isDone ? DateTime.now().toUTC().toISO() : false;
      const updatedEvent: OFCEvent = {
        ...event,
        completed
      };

      await this.updateEvent({ persistentId: event.uid }, event, updatedEvent);
      await PluginState.getCache()?.updateEventWithId(eventId, updatedEvent, { silent: true });
      return true;
    } catch (e) {
      console.error('Google Tasks toggleComplete failed', e);
      return false;
    }
  }

  createInstanceOverride(): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(new Error('Google Tasks does not support recurring event overrides.'));
  }

  getConfigurationComponent(): FCReactComponent<GoogleTasksConfigProps> {
    return createGoogleTasksConfigWrapper(this.plugin);
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return GoogleTasksNameSetting;
  }
}
