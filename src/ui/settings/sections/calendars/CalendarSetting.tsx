import { showNotice } from '../../../../utils/showNotice';
/**
 * @file CalendarSetting.tsx
 * @brief React component for displaying and managing a list of configured calendars.
 *
 * @description
 * This file defines the `CalendarSettings` component, which is embedded in the
 * plugin's settings tab. It is responsible for rendering the list of all
 * currently configured calendar sources, allowing the user to modify their
 * colors or delete them. It maintains its own state and syncs with the
 * plugin settings upon saving.
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../../../core/PluginState';

import * as React from 'react';
import { setIcon, TFile, TFolder } from 'obsidian';
import { CalendarInfo } from '../../../../types/calendar_settings';
import FullCalendarPlugin from '../../../../main';
import { t } from '../../../../features/i18n/i18n';
import ReactModal from '../../../ReactModal';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { ProviderConfigContext } from '../../../../providers/typesProvider';

type EditableCalendarInfo = CalendarInfo & { newNoteTemplatePath?: string };

interface EditProviderConfigProps {
  plugin: FullCalendarPlugin;
  config: Partial<CalendarInfo>;
  context: ProviderConfigContext;
  onClose: () => void;
  onConfigChange: (config: Partial<CalendarInfo>) => void;
  onSave: (finalConfig: Partial<CalendarInfo> | Partial<CalendarInfo>[]) => void;
}

const SettingsRowIcon = ({ name }: { name: string }) => {
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, name);
    }
  }, [name]);

  return <span ref={ref} aria-hidden="true" />;
};

// Define props for the new stable component
interface CalendarSettingRowProps {
  children: React.ReactNode;
  setting: Partial<CalendarInfo>;
  editCalendar: () => void;
  deleteCalendar: () => void;
  moveUp: () => void;
  moveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

// The new stable row component
const CalendarSettingRow = ({
  children,
  setting,
  editCalendar,
  deleteCalendar,
  moveUp,
  moveDown,
  canMoveUp,
  canMoveDown
}: CalendarSettingRowProps) => {
  return (
    <tr className="ofc-calendar-settings-table-row">
      <td className="ofc-calendar-settings-table-color">
        <span
          className="ofc-calendar-settings-color-swatch"
          style={{ backgroundColor: setting.color }}
        />
      </td>
      <td className="ofc-calendar-settings-table-name">
        <div className="ofc-calendar-settings-primary">{setting.name || 'Untitled calendar'}</div>
        <div className="ofc-calendar-settings-muted">{setting.id}</div>
      </td>
      <td className="ofc-calendar-settings-table-type">{setting.type || 'Unknown'}</td>
      <td className="ofc-calendar-settings-table-details">{children}</td>
      <td className="ofc-calendar-settings-table-template">
        {(setting as { newNoteTemplatePath?: string }).newNoteTemplatePath || 'None'}
      </td>
      <td className="ofc-calendar-settings-table-actions">
        <div className="fc-setting-reorder-controls">
          <button
            type="button"
            onClick={moveUp}
            disabled={!canMoveUp}
            className="fc-setting-reorder-btn"
            aria-label="Move up"
            title="Move up"
          >
            <SettingsRowIcon name="arrow-up" />
          </button>
          <button
            type="button"
            onClick={moveDown}
            disabled={!canMoveDown}
            className="fc-setting-reorder-btn"
            aria-label="Move down"
            title="Move down"
          >
            <SettingsRowIcon name="arrow-down" />
          </button>
        </div>
        <button
          type="button"
          onClick={editCalendar}
          className="fc-setting-icon-btn"
          aria-label="Edit calendar"
          title="Edit calendar"
        >
          <SettingsRowIcon name="pencil" />
        </button>
        <button
          type="button"
          onClick={deleteCalendar}
          className="fc-setting-icon-btn"
          aria-label="Delete calendar"
          title="Delete calendar"
        >
          <SettingsRowIcon name="trash-2" />
        </button>
      </td>
    </tr>
  );
};

interface CalendarSettingsProps {
  sources: CalendarInfo[];
  submit: (payload: CalendarInfo[]) => void;
  plugin: FullCalendarPlugin;
}

// ✅ Expose this type in `settings.tsx`
export interface CalendarSettingsRef {
  addSource: (source: CalendarInfo) => void;
  getUsedDirectories: () => string[];
}

type CalendarSettingState = {
  sources: CalendarInfo[];
  dirty: boolean;
};

export class CalendarSettings
  extends React.Component<CalendarSettingsProps, CalendarSettingState>
  implements CalendarSettingsRef
{
  constructor(props: CalendarSettingsProps) {
    super(props);
    this.state = { sources: props.sources, dirty: false };
  }

  addSource = (source: CalendarInfo) => {
    this.setState(state => ({
      sources: [...state.sources, source],
      dirty: true
    }));
  };

  getUsedDirectories = () => {
    return this.state.sources
      .map(s => s.type === 'local' && s.directory)
      .filter((s): s is string => !!s);
  };

  updateSource = (index: number, source: CalendarInfo) => {
    this.setState(state => {
      const newSources = [...state.sources];
      newSources[index] = source;
      return {
        sources: newSources,
        dirty: true
      };
    });
  };

  moveSource = (from: number, to: number) => {
    this.setState(state => {
      if (to < 0 || to >= state.sources.length) return null;
      const newSources = [...state.sources];
      const [moved] = newSources.splice(from, 1);
      newSources.splice(to, 0, moved);
      return { sources: newSources, dirty: true };
    });
  };

  render() {
    return (
      <div className="u-w-full">
        <div className="ofc-calendar-settings-table-wrap">
          <table className="ofc-calendar-settings-table">
            <thead>
              <tr>
                <th>Color</th>
                <th>Name</th>
                <th>Type</th>
                <th>Properties</th>
                <th>Template</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {this.state.sources.map((s, idx) => (
                <ProviderAwareCalendarSettingRow
                  key={s.id || idx}
                  setting={s}
                  plugin={this.props.plugin}
                  editCalendar={() => {
                    void openEditCalendarModal(this.props.plugin, s, updated => {
                      this.updateSource(idx, updated);
                    });
                  }}
                  deleteCalendar={() =>
                    this.setState(state => ({
                      sources: [...state.sources.slice(0, idx), ...state.sources.slice(idx + 1)],
                      dirty: true
                    }))
                  }
                  moveUp={() => this.moveSource(idx, idx - 1)}
                  moveDown={() => this.moveSource(idx, idx + 1)}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < this.state.sources.length - 1}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="setting-item-control">
          {this.state.dirty && (
            <button
              className="mod-cta"
              onClick={() => {
                if (this.state.sources.filter(s => s.type === 'dailynote').length > 1) {
                  showNotice(t('settings.warnings.oneDailyNote'));
                  return;
                }
                this.props.submit(this.state.sources.map(elt => elt));
                this.setState({ dirty: false });
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>
    );
  }
}

// Provider-Aware Calendar Setting Row - the main component
interface ProviderAwareCalendarSettingsRowProps {
  setting: Partial<CalendarInfo>;
  editCalendar: () => void;
  deleteCalendar: () => void;
  moveUp: () => void;
  moveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  plugin: FullCalendarPlugin;
}

export const ProviderAwareCalendarSettingRow = ({
  setting,
  editCalendar,
  deleteCalendar,
  moveUp,
  moveDown,
  canMoveUp,
  canMoveDown,
  plugin: _plugin
}: ProviderAwareCalendarSettingsRowProps) => {
  const registry = PluginState.getProviderRegistry();
  const provider = setting.id ? registry.getInstance(setting.id) : null;

  const rowProps = {
    setting,
    editCalendar,
    deleteCalendar,
    moveUp,
    moveDown,
    canMoveUp,
    canMoveDown
  };

  // All providers should implement the required method - get the provider-specific content
  if (provider) {
    // Defensive check: if provider doesn't have the new method, provide fallback
    if (typeof provider.getSettingsRowComponent !== 'function') {
      console.warn(
        'Full Calendar: Provider instance missing getSettingsRowComponent method. Using fallback display. Please reload the plugin.'
      );

      // Fallback rendering - display basic info about the calendar source
      const displayName = setting.name || setting.type || 'Unknown';
      return (
        <CalendarSettingRow {...rowProps}>
          <div className="ofc-calendar-settings-provider-summary">
            <span>{displayName} calendar</span>
          </div>
        </CalendarSettingRow>
      );
    }

    const ProviderContent = provider.getSettingsRowComponent();
    return (
      <CalendarSettingRow {...rowProps}>
        <ProviderContent source={setting} />
      </CalendarSettingRow>
    );
  }

  // Fallback for sources without an ID or provider not found (should not happen in normal operation)
  return (
    <CalendarSettingRow {...rowProps}>
      <div className="ofc-calendar-settings-provider-summary">
        <span>Provider not found</span>
      </div>
    </CalendarSettingRow>
  );
};

interface EditCalendarFormProps {
  plugin: FullCalendarPlugin;
  source: CalendarInfo;
  ConfigComponent: React.ComponentType<EditProviderConfigProps>;
  onClose: () => void;
  onSave: (source: CalendarInfo) => void;
}

const EditCalendarForm = ({
  plugin,
  source,
  ConfigComponent,
  onClose,
  onSave
}: EditCalendarFormProps) => {
  const editableSource = source as EditableCalendarInfo;
  const [name, setName] = React.useState(source.name || '');
  const [color, setColor] = React.useState(source.color || '#3788d8');
  const [newNoteTemplatePath, setNewNoteTemplatePath] = React.useState(
    editableSource.newNoteTemplatePath || ''
  );
  const [context, setContext] = React.useState<ProviderConfigContext>({
    allDirectories: [],
    usedDirectories: [],
    headings: []
  });

  React.useEffect(() => {
    const directories = plugin.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder)
      .map(f => f.path);
    const usedDirectories = PluginState.getSettings()
      .calendarSources.filter(candidate => candidate.id !== source.id)
      .map(candidate => candidate.type === 'local' && candidate.directory)
      .filter((directory): directory is string => !!directory);

    let headings: string[] = [];
    let { template } = getDailyNoteSettings();
    if (template) {
      if (!template.endsWith('.md')) template += '.md';
      const file = plugin.app.vault.getAbstractFileByPath(template);
      if (file instanceof TFile) {
        headings = plugin.app.metadataCache.getFileCache(file)?.headings?.map(h => h.heading) || [];
      }
    }

    setContext({
      allDirectories: directories.filter(dir => usedDirectories.indexOf(dir) === -1),
      usedDirectories,
      headings
    });
  }, [plugin, source.id]);

  return (
    <div className="ofc-calendar-edit-modal">
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Calendar name</div>
          <div className="setting-item-description">
            Name shown in settings and calendar filters.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            className="fc-setting-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Color</div>
          <div className="setting-item-description">Default event color for this calendar.</div>
        </div>
        <div className="setting-item-control">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} />
        </div>
      </div>
      {(source.type === 'local' || source.type === 'basefull') && (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Template path</div>
            <div className="setting-item-description">Optional note template for new events.</div>
          </div>
          <div className="setting-item-control">
            <input
              className="fc-setting-input"
              type="text"
              value={newNoteTemplatePath}
              placeholder="Template path"
              onChange={e => setNewNoteTemplatePath(e.target.value)}
            />
          </div>
        </div>
      )}
      <ConfigComponent
        plugin={plugin}
        config={source}
        context={context}
        onClose={onClose}
        onConfigChange={() => undefined}
        onSave={(finalConfig: Partial<CalendarInfo> | Partial<CalendarInfo>[]) => {
          const [firstConfig] = Array.isArray(finalConfig) ? finalConfig : [finalConfig];
          const updatedSource = {
            ...source,
            ...firstConfig,
            id: source.id,
            type: source.type,
            name: name.trim() || source.name,
            color,
            newNoteTemplatePath: newNoteTemplatePath.trim() || undefined
          } as CalendarInfo;
          onSave(updatedSource);
          onClose();
        }}
      />
    </div>
  );
};

async function openEditCalendarModal(
  plugin: FullCalendarPlugin,
  source: CalendarInfo,
  onSave: (source: CalendarInfo) => void
): Promise<void> {
  const providerClass = await PluginState.getProviderRegistry().getProviderForType(source.type);
  if (!providerClass) {
    showNotice(t('notices.providerNotRegistered', { providerType: source.type }));
    return;
  }

  const ConfigComponent = (
    providerClass as unknown as {
      getConfigurationComponent(): React.ComponentType<EditProviderConfigProps>;
    }
  ).getConfigurationComponent();

  const modal = new ReactModal(plugin.app, async () => {
    modal.contentEl.parentElement?.addClass('settings-modal-wide');
    return (
      <EditCalendarForm
        plugin={plugin}
        source={source}
        ConfigComponent={ConfigComponent}
        onClose={() => modal.close()}
        onSave={onSave}
      />
    );
  });
  modal.open();
}
