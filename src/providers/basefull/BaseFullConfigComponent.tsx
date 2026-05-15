import * as React from 'react';
import { TFolder, parseYaml } from 'obsidian';
import { ProviderConfigContext } from '../typesProvider';
import FullCalendarPlugin from '../../main';
import { BaseFullProviderConfig } from './BaseFullProvider';

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
  const [createDirectory, setCreateDirectory] = React.useState(config.createDirectory || '');
  const [dateProperty, setDateProperty] = React.useState(config.dateProperty || 'date');
  const [statusProperty, setStatusProperty] = React.useState(config.statusProperty || '');
  const [completeStatusValue, setCompleteStatusValue] = React.useState(
    config.completeStatusValue || 'done'
  );
  const [incompleteStatusValue, setIncompleteStatusValue] = React.useState(
    config.incompleteStatusValue || 'todo'
  );
  const [customPropertyTemplate, setCustomPropertyTemplate] = React.useState(
    config.customPropertyTemplate || ''
  );
  const [templateError, setTemplateError] = React.useState<string | null>(null);
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
    onConfigChange({
      ...config,
      basePath,
      createDirectory,
      dateProperty,
      statusProperty,
      completeStatusValue,
      incompleteStatusValue,
      customPropertyTemplate,
      ...next
    });
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!basePath || !createDirectory || !dateProperty) return;
    if (customPropertyTemplate.trim()) {
      try {
        const parsed: unknown = parseYaml(customPropertyTemplate);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setTemplateError('Template must be a YAML object.');
          return;
        }
      } catch (error) {
        setTemplateError(error instanceof Error ? error.message : 'Invalid YAML template.');
        return;
      }
    }

    const name = basePath.split('/').pop()?.replace('.base', '') || 'Base Full';
    onSave({
      type: 'basefull',
      basePath,
      createDirectory,
      dateProperty,
      statusProperty: statusProperty.trim() || undefined,
      completeStatusValue,
      incompleteStatusValue,
      customPropertyTemplate: customPropertyTemplate.trim() || undefined,
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
              setBasePath(e.target.value);
              emitConfig({ basePath: e.target.value });
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
        <div className="setting-item-info">
          <div className="setting-item-name">Additional properties template</div>
          <div className="setting-item-description">
            YAML keys listed here appear in the new/edit event popup and are saved as frontmatter.
          </div>
        </div>
        <div className="setting-item-control u-display-block">
          <textarea
            value={customPropertyTemplate}
            placeholder={'priority: medium\nproject:\nreviewed: false'}
            rows={6}
            onChange={e => {
              const next = e.target.value;
              setCustomPropertyTemplate(next);
              setTemplateError(null);
              emitConfig({ customPropertyTemplate: next || undefined });
            }}
          />
          {templateError && (
            <div className="setting-item-description mod-warning">{templateError}</div>
          )}
        </div>
      </div>

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
