import { showNotice } from '../../utils/showNotice';
import { Menu } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { t } from '../../features/i18n/i18n';
import { ViewContext } from './ViewContext';

export class ViewUIHandler {
  private workspaceSwitchTimeout: number | null = null;

  constructor(private ctx: ViewContext) {}

  public getWorkspaceSwitcherText(): string {
    const activeWorkspace = this.ctx.viewEnhancer?.getActiveWorkspace();
    if (!activeWorkspace) {
      return `${t('ui.view.workspace.switcherLabel')} ▾`;
    }

    const maxLength = PluginState.isMobile() ? 8 : 12;
    const name =
      activeWorkspace.name.length > maxLength
        ? `${activeWorkspace.name.substring(0, maxLength)}...`
        : activeWorkspace.name;

    return `${name} ▾`;
  }

  public showWorkspaceSwitcher(ev?: MouseEvent) {
    const menu = new Menu();

    menu.addItem(item => {
      item
        .setTitle(t('ui.view.buttons.defaultView'))
        .setIcon(PluginState.getSettings().activeWorkspace === null ? 'check' : '')
        .onClick(async () => {
          await this.switchToWorkspace(null);
        });
    });

    if (PluginState.getSettings().workspaces.length > 0) {
      menu.addSeparator();

      PluginState.getSettings().workspaces.forEach(workspace => {
        menu.addItem(item => {
          item
            .setTitle(workspace.name)
            .setIcon(PluginState.getSettings().activeWorkspace === workspace.id ? 'check' : '')
            .onClick(async () => {
              await this.switchToWorkspace(workspace.id);
            });
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

  public async switchToWorkspace(workspaceId: string | null) {
    if (this.workspaceSwitchTimeout) {
      window.clearTimeout(this.workspaceSwitchTimeout);
    }
    PluginState.getSettings().activeWorkspace = workspaceId;
    await PluginState.saveSettings();

    this.workspaceSwitchTimeout = window.setTimeout(() => {
      void this.ctx.refreshView();
    }, 100);
  }

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

  public async activateChronoAnalyser(): Promise<void> {
    if (PluginState.isMobile()) {
      showNotice(t('ui.view.errors.chronoAnalyserDesktopOnly'));
      return;
    }
    try {
      const { activateAnalysisView } = await import('../../chrono_analyser/AnalysisView');
      await activateAnalysisView(this.ctx.app);
    } catch (err) {
      console.error('Full Calendar: Failed to activate Chrono Analyser view', err);
      showNotice(t('ui.view.errors.chronoAnalyserFailed'));
    }
  }

  public refreshRemoteCalendars(): void {
    PluginState.getProviderRegistry().revalidateRemoteCalendars(true);
  }
}
