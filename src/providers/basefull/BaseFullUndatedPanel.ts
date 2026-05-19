import { Draggable } from '@fullcalendar/interaction';
import { PluginState } from '../../core/PluginState';
import { PLUGIN_SLUG, type CalendarInfo } from '../../types';
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

function formatUndatedItemStatus(item: BaseFullUndatedItem): string {
  return item.status || 'No status';
}

export class BaseFullUndatedPanel {
  private collapsed = false;
  private collapsedCalendarIds = new Set<string>();
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
    const settings = PluginState.getSettings();
    const hiddenCalendarIds = new Set((settings.hiddenCalendarIds ?? []).map(String));

    const sources = PluginState.getProviderRegistry()
      .getAllSources()
      .filter(
        (source): source is CalendarInfo & { type: 'basefull'; id: string; name: string } =>
          source.type === 'basefull' && typeof source.id === 'string'
      )
      .filter(source => !hiddenCalendarIds.has(String(source.id)));

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
    const currentIds = new Set(this.groups.map(group => group.calendarId));
    this.collapsedCalendarIds.forEach(calendarId => {
      if (!currentIds.has(calendarId)) {
        this.collapsedCalendarIds.delete(calendarId);
      }
    });
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
      const canCollapseGroup = this.groups.length > 1;
      const isGroupCollapsed =
        canCollapseGroup && this.collapsedCalendarIds.has(group.calendarId);
      groupEl.toggleClass('is-collapsible', canCollapseGroup);
      groupEl.toggleClass('is-collapsed', isGroupCollapsed);

      const groupTitleEl = groupEl.createEl(canCollapseGroup ? 'button' : 'div', {
        cls: 'basefull-undated-group-title',
        attr: canCollapseGroup
          ? {
              type: 'button',
              'aria-expanded': String(!isGroupCollapsed)
            }
          : undefined
      });
      groupTitleEl.createSpan({ cls: 'basefull-undated-group-name', text: group.calendarName });
      groupTitleEl.createSpan({
        cls: 'basefull-undated-group-count',
        text: String(group.items.length)
      });

      if (canCollapseGroup) {
        groupTitleEl.addEventListener('click', () => {
          if (this.collapsedCalendarIds.has(group.calendarId)) {
            this.collapsedCalendarIds.delete(group.calendarId);
          } else {
            this.collapsedCalendarIds.add(group.calendarId);
          }
          this.render();
        });
      }

      if (isGroupCollapsed) {
        continue;
      }

      for (const item of group.items) {
        const itemWrapperEl = groupEl.createDiv({ cls: 'tree-item nav-file basefull-undated-item-wrapper' });
        const itemEl = itemWrapperEl.createEl('a', {
          cls: 'tree-item-self nav-file-title internal-link basefull-undated-item',
          attr: {
            href: item.path,
            draggable: 'true',
            'data-href': item.path,
            'data-basefull-calendar-id': group.calendarId,
            'data-basefull-path': item.path
          }
        });
        itemEl.createSpan({
          cls: 'tree-item-inner nav-file-title-content basefull-undated-item-title',
          text: item.title
        });
        const metaEl = itemEl.createSpan({ cls: 'basefull-undated-item-meta' });
        const checkboxEl = metaEl.createEl('input', {
          cls: 'basefull-undated-item-checkbox ofc-checkbox-black',
          attr: { type: 'checkbox', disabled: 'true' }
        });
        checkboxEl.checked = item.completed;
        metaEl.createSpan({
          cls: 'basefull-undated-item-status',
          text: formatUndatedItemStatus(item)
        });
        if (item.due) {
          metaEl.createSpan({ cls: 'basefull-undated-item-due', text: `Due ${item.due}` });
        }
        itemEl.addEventListener('click', event => {
          event.preventDefault();
          void PluginState.getPlugin().app.workspace.openLinkText(item.path, item.path);
        });
        itemEl.addEventListener('mouseenter', event => {
          this.triggerLinkHover(event, item.path, itemEl);
        });
      }
    }

    this.draggable?.destroy();
    this.draggable = new Draggable(listEl, {
      itemSelector: '.basefull-undated-item'
    });
  }

  private triggerLinkHover(event: MouseEvent, path: string, targetEl: HTMLElement): void {
    try {
      PluginState.getPlugin().app.workspace.trigger('hover-link', {
        event,
        source: PLUGIN_SLUG,
        hoverParent: this.containerEl,
        targetEl,
        linktext: path,
        sourcePath: path
      });
    } catch {
      // Hover previews are optional and depend on Obsidian's Page Preview plugin.
    }
  }
}
