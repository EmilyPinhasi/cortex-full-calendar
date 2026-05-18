import { Menu } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { ViewContext } from './ViewContext';

export class ViewUIHandler {
  constructor(private ctx: ViewContext) {}

  public showCalendarsMenu(ev?: MouseEvent) {
    const settings = PluginState.getSettings();
    const sources = settings.calendarSources.filter(s => s.type !== 'FOR_TEST_ONLY');
    const hidden = new Set((settings.hiddenCalendarIds ?? []).map(String));

    const menu = new Menu();

    if (sources.length === 0) {
      menu.addItem(item => item.setTitle('No calendars configured').setDisabled(true));
    } else {
      sources.forEach(source => {
        const id = String(source.id);
        const isVisible = !hidden.has(id);
        const name = source.name || id;
        menu.addItem(item => {
          item
            .setTitle(name)
            .setIcon(isVisible ? 'check' : '')
            .onClick(async () => {
              await this.toggleCalendarVisibility(id);
            });
        });
      });

      menu.addSeparator();
      const anyHidden = sources.some(s => hidden.has(String(s.id)));
      menu.addItem(item => {
        item
          .setTitle(anyHidden ? 'Show all calendars' : 'Hide all calendars')
          .onClick(async () => {
            await this.setAllCalendarsVisible(!anyHidden);
          });
      });
    }

    if (ev) {
      menu.showAtMouseEvent(ev);
    } else {
      const rect = this.ctx.containerEl.getBoundingClientRect();
      menu.showAtPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }
  }

  public async toggleCalendarVisibility(calendarId: string): Promise<void> {
    const settings = PluginState.getSettings();
    const current = new Set((settings.hiddenCalendarIds ?? []).map(String));
    if (current.has(calendarId)) {
      current.delete(calendarId);
    } else {
      current.add(calendarId);
    }
    settings.hiddenCalendarIds = Array.from(current);
    await PluginState.saveSettings();
    void this.ctx.refreshView();
  }

  public async setAllCalendarsVisible(hideAll: boolean): Promise<void> {
    const settings = PluginState.getSettings();
    if (hideAll) {
      settings.hiddenCalendarIds = settings.calendarSources
        .filter(s => s.type !== 'FOR_TEST_ONLY')
        .map(s => String(s.id));
    } else {
      settings.hiddenCalendarIds = [];
    }
    await PluginState.saveSettings();
    void this.ctx.refreshView();
  }

  public refreshRemoteCalendars(): void {
    PluginState.getProviderRegistry().revalidateRemoteCalendars(true);
  }
}
