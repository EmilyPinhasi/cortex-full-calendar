import { Draggable } from '@fullcalendar/interaction';
import { PluginState } from '../../core/PluginState';
import type { CalendarInfo } from '../../types';
import type { BaseFullProvider, BaseFullUndatedItem } from './BaseFullProvider';
import './undated-panel.css';

interface BaseFullUndatedGroup {
  calendarId: string;
  calendarName: string;
  color: string;
  items: BaseFullUndatedItem[];
}

interface BaseFullUndatedProvider {
  getUndatedItems(): Promise<BaseFullUndatedItem[]>;
}

function isBaseFullUndatedProvider(provider: unknown): provider is BaseFullUndatedProvider {
  return (
    !!provider &&
    typeof provider === 'object' &&
    'getUndatedItems' in provider &&
    typeof (provider as { getUndatedItems?: unknown }).getUndatedItems === 'function'
  );
}

export class BaseFullUndatedPanel {
  private collapsed = false;
  private groups: BaseFullUndatedGroup[] = [];
  private draggable: Draggable | null = null;

  constructor(private readonly containerEl: HTMLElement) {}

  async refresh(): Promise<void> {
    await this.loadItems();
    this.render();
  }

  destroy(): void {
    this.draggable?.destroy();
    this.draggable = null;
    this.containerEl.empty();
  }

  private async loadItems(): Promise<void> {
    const sources = PluginState.getProviderRegistry()
      .getAllSources()
      .filter(
        (source): source is CalendarInfo & { type: 'basefull'; id: string; name: string } =>
          source.type === 'basefull' && typeof source.id === 'string'
      );

    const groups = await Promise.all(
      sources.map(async source => {
        const provider = PluginState.getProviderRegistry().getInstance(source.id);
        if (!isBaseFullUndatedProvider(provider)) {
          return null;
        }

        const items = await provider.getUndatedItems();
        return {
          calendarId: source.id,
          calendarName: source.name || (provider as BaseFullProvider).displayName,
          color: source.color,
          items
        };
      })
    );

    this.groups = groups
      .filter((group): group is BaseFullUndatedGroup => group !== null)
      .filter(group => group.items.length > 0);
  }

  private render(): void {
    this.containerEl.empty();
    this.containerEl.addClass('basefull-undated-panel');
    this.containerEl.toggleClass('is-collapsed', this.collapsed);

    if (this.groups.length === 0) {
      this.containerEl.toggleClass('is-empty', true);
      return;
    }

    this.containerEl.toggleClass('is-empty', false);

    const headerEl = this.containerEl.createDiv({ cls: 'basefull-undated-panel-header' });
    const toggleEl = headerEl.createEl('button', {
      cls: 'clickable-icon basefull-undated-panel-toggle',
      text: this.collapsed ? '>' : '<',
      attr: {
        type: 'button',
        'aria-label': this.collapsed ? 'Expand undated Base items' : 'Collapse undated Base items'
      }
    });
    toggleEl.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.render();
    });

    const titleEl = headerEl.createDiv({ cls: 'basefull-undated-panel-title' });
    titleEl.createSpan({ text: 'Undated Base items' });
    titleEl.createSpan({
      text: String(this.groups.reduce((sum, group) => sum + group.items.length, 0)),
      cls: 'basefull-undated-panel-count'
    });

    if (this.collapsed) {
      return;
    }

    const bodyEl = this.containerEl.createDiv({ cls: 'basefull-undated-panel-body' });
    bodyEl.createDiv({
      cls: 'basefull-undated-panel-help',
      text: 'Drag an item onto the calendar to set its date.'
    });

    const listEl = bodyEl.createDiv({ cls: 'basefull-undated-panel-list' });
    for (const group of this.groups) {
      const groupEl = listEl.createDiv({ cls: 'basefull-undated-group' });
      groupEl.style.setProperty('--basefull-calendar-color', group.color);
      groupEl.createDiv({ cls: 'basefull-undated-group-title', text: group.calendarName });

      for (const item of group.items) {
        const itemEl = groupEl.createDiv({
          cls: 'basefull-undated-item',
          attr: {
            draggable: 'true',
            'data-basefull-calendar-id': group.calendarId,
            'data-basefull-path': item.path
          }
        });
        itemEl.createDiv({ cls: 'basefull-undated-item-title', text: item.title });
        itemEl.createDiv({ cls: 'basefull-undated-item-path', text: item.path });
      }
    }

    this.draggable?.destroy();
    this.draggable = new Draggable(listEl, {
      itemSelector: '.basefull-undated-item'
    });
  }
}
