import * as React from 'react';
import { TFile, TFolder, parseYaml } from 'obsidian';
import { ProviderConfigContext } from '../typesProvider';
import FullCalendarPlugin from '../../main';
import { BaseFullProviderConfig } from './BaseFullProvider';
import { BaseFile, BaseView } from '../bases/baseFilter';

export interface BaseFullConfigComponentProps {
  plugin: FullCalendarPlugin;
  config: Partial<BaseFullProviderConfig>;
  onConfigChange: (newConfig: Partial<BaseFullProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: BaseFullProviderConfig | BaseFullProviderConfig[]) => void;
  onClose: () => void;
}

export const BaseFullConfigComponent: React.FC<BaseFullConfigComponentProps> = ({
  plugin,
  config,
  onConfigChange,
  onSave
}) => {
  const [basePath, setBasePath] = React.useState(config.basePath || '');
  const [baseViewIndex, setBaseViewIndex] = React.useState(config.baseViewIndex ?? 0);
  const [baseViews, setBaseViews] = React.useState<BaseView[]>([]);
  const [createDirectory, setCreateDirectory] = React.useState(config.createDirectory || '');
  const [dateProperty, setDateProperty] = React.useState(config.dateProperty || 'date');
  const [statusProperty, setStatusProperty] = React.useState(config.statusProperty || '');
  const [completeStatusValue, setCompleteStatusValue] = React.useState(
    config.completeStatusValue || 'done'
  );
  const [incompleteStatusValue, setIncompleteStatusValue] = React.useState(
    config.incompleteStatusValue || 'todo'
  );
  const [baseFiles, setBaseFiles] = React.useState<string[]>([]);
  const [directories, setDirectories] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!plugin) return;
    const files = plugin.app.vault.getFiles().filter(f => f.extension === 'base');
    setBaseFiles(files.map(f => f.path));
    setDirectories(
      plugin.app.vault
        .getAllLoadedFiles()
        .filter((file): file is TFolder => file instanceof TFolder)
        .map(file => file.path)
    );
  }, [plugin]);

  const emitConfig = (next: Partial<BaseFullProviderConfig>) => {
    const nextConfig = {
      basePath,
      baseViewIndex,
      createDirectory,
      dateProperty,
      statusProperty,
      completeStatusValue,
      incompleteStatusValue,
      ...next
    };
    onConfigChange({
      ...config,
      ...nextConfig
    });
  };

  React.useEffect(() => {
    if (!plugin || !basePath) {
      setBaseViews([]);
      return;
    }

    let cancelled = false;
    const loadViews = async () => {
      const file = plugin.app.vault.getAbstractFileByPath(basePath);
      if (!(file instanceof TFile)) {
        if (!cancelled) setBaseViews([]);
        return;
      }

      try {
        const baseData = parseYaml(await plugin.app.vault.read(file)) as BaseFile;
        const views = Array.isArray(baseData.views) ? baseData.views : [];
        if (!cancelled) {
          setBaseViews(views);
          if (views.length > 0) {
            setBaseViewIndex(current => (current >= views.length ? 0 : current));
          }
        }
      } catch (error) {
        console.warn('Failed to parse Base file while loading views', error);
        if (!cancelled) setBaseViews([]);
      }
    };

    void loadViews();
    return () => {
      cancelled = true;
    };
  }, [basePath, plugin]);

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!basePath || !createDirectory || !dateProperty) return;
    const name = basePath.split('/').pop()?.replace('.base', '') || 'Base Full';
    onSave({
      type: 'basefull',
      basePath,
      createDirectory,
      dateProperty,
      baseViewIndex,
      statusProperty: statusProperty.trim() || undefined,
      completeStatusValue,
      incompleteStatusValue,
      name: config.name || `${name} Full`,
      color: config.color || '#3788d8'
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Select Base</div>
          <div className="setting-item-description">
            Choose the .base file whose filters decide which notes appear on the calendar.
          </div>
        </div>
        <div className="setting-item-control">
          <select
            className="dropdown"
            value={basePath}
            onChange={e => {
              const nextBasePath = e.target.value;
              setBasePath(nextBasePath);
              setBaseViewIndex(0);
              emitConfig({ basePath: nextBasePath, baseViewIndex: 0 });
            }}
          >
            <option value="">Select a base...</option>
            {baseFiles.map(path => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </div>
      </div>

      {basePath && baseViews.length > 0 && (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Base view</div>
            <div className="setting-item-description">
              Choose which view filters this calendar source should use.
            </div>
          </div>
          <div className="setting-item-control">
            <select
              className="dropdown"
              value={baseViewIndex}
              onChange={e => {
                const nextViewIndex = Number(e.target.value);
                setBaseViewIndex(nextViewIndex);
                emitConfig({ baseViewIndex: nextViewIndex });
              }}
            >
              {baseViews.map((view, index) => (
                <option key={index} value={index}>
                  {view.name || `View ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">New note directory</div>
          <div className="setting-item-description">
            New calendar events are created as notes in this folder.
          </div>
        </div>
        <div className="setting-item-control">
          <select
            className="dropdown"
            value={createDirectory}
            onChange={e => {
              setCreateDirectory(e.target.value);
              emitConfig({ createDirectory: e.target.value });
            }}
          >
            <option value="">Select a folder...</option>
            {directories.map(path => (
              <option key={path} value={path}>
                {path || '/'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Date property</div>
          <div className="setting-item-description">
            Frontmatter property to read and write as the event date.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={dateProperty}
            placeholder="date"
            onChange={e => {
              setDateProperty(e.target.value);
              emitConfig({ dateProperty: e.target.value });
            }}
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Status property</div>
          <div className="setting-item-description">
            Optional frontmatter property to map to the task completed checkbox.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={statusProperty}
            placeholder="status"
            onChange={e => {
              setStatusProperty(e.target.value);
              emitConfig({ statusProperty: e.target.value || undefined });
            }}
          />
        </div>
      </div>

      {statusProperty && (
        <>
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Incomplete status value</div>
            </div>
            <div className="setting-item-control">
              <input
                type="text"
                value={incompleteStatusValue}
                onChange={e => {
                  setIncompleteStatusValue(e.target.value);
                  emitConfig({ incompleteStatusValue: e.target.value });
                }}
              />
            </div>
          </div>
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Complete status value</div>
            </div>
            <div className="setting-item-control">
              <input
                type="text"
                value={completeStatusValue}
                onChange={e => {
                  setCompleteStatusValue(e.target.value);
                  emitConfig({ completeStatusValue: e.target.value });
                }}
              />
            </div>
          </div>
        </>
      )}

      <div className="setting-item">
        <div className="setting-item-control">
          <button className="mod-cta" type="submit" disabled={!basePath || !createDirectory}>
            Add Calendar
          </button>
        </div>
      </div>
    </form>
  );
};
