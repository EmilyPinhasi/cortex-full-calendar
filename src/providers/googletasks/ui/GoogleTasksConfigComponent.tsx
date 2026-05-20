import { PluginState } from '../../../core/PluginState';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { GoogleAccount } from '../../../types/settings';
import { GoogleApiError } from '../../google/auth/request';
import { GoogleAuthManager } from '../../google/auth/GoogleAuthManager';
import { startGoogleLogin } from '../../google/auth/auth';
import { t } from '../../../features/i18n/i18n';

type SelectedGoogleTaskList = {
  id: string;
  name: string;
  color: string;
};

interface GoogleTasksConfigComponentProps {
  plugin: FullCalendarPlugin;
  onSave: (configs: SelectedGoogleTaskList[], accountId: string) => void;
  onClose: () => void;
}

interface TaskListDisplayItem {
  id: string;
  title: string;
}

export const GoogleTasksConfigComponent: React.FC<GoogleTasksConfigComponentProps> = ({
  plugin,
  onSave,
  onClose
}) => {
  const [view, setView] = useState<'account-select' | 'list-select'>('account-select');
  const [accounts, setAccounts] = useState<GoogleAccount[]>(
    PluginState.getSettings().googleAccounts || []
  );
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccount | null>(null);
  const [availableLists, setAvailableLists] = useState<TaskListDisplayItem[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authManager = useMemo(() => new GoogleAuthManager(plugin), [plugin]);
  const accountListRef = useRef<HTMLDivElement>(null);
  const taskListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleAccountAdded = () => {
      setAccounts([...(PluginState.getSettings().googleAccounts || [])]);
    };
    (plugin.app.workspace as unknown as { on: (name: string, cb: () => void) => void }).on(
      'full-calendar:google-account-added',
      handleAccountAdded
    );
    return () => {
      (plugin.app.workspace as unknown as { off: (name: string, cb: () => void) => void }).off(
        'full-calendar:google-account-added',
        handleAccountAdded
      );
    };
  }, [plugin]);

  const handleSelectAccount = useCallback(
    async (account: GoogleAccount) => {
      setIsLoading(true);
      setError(null);
      setSelectedAccount(account);

      try {
        let accessToken: string | null = null;
        if (
          !account.accessToken ||
          !account.expiryDate ||
          Date.now() >= account.expiryDate - 60000
        ) {
          accessToken = await authManager.getTokenForSource({
            type: 'google',
            id: `temp_${account.id}`,
            name: account.email,
            calendarId: 'primary',
            googleAccountId: account.id,
            color: ''
          });
          if (!accessToken) {
            throw new GoogleApiError(
              `Failed to refresh token for ${account.email}. Please reconnect the account.`
            );
          }
        } else {
          accessToken = account.accessToken;
        }

        const { fetchGoogleTaskLists } = await import('../auth/api');
        const allLists = await fetchGoogleTaskLists({ ...account, accessToken });
        const existingListIds = new Set(
          PluginState.getSettings()
            .calendarSources.filter(
              (s): s is Extract<typeof s, { type: 'googletasks'; taskListId: string }> =>
                s.type === 'googletasks'
            )
            .map(s => s.taskListId)
        );
        setAvailableLists(allLists.filter(list => !existingListIds.has(list.id)));
        setSelection(new Set());
        setView('list-select');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        setError(`Failed to fetch Google Tasks lists for ${account.email}. ${message}`);
        setView('account-select');
      } finally {
        setIsLoading(false);
      }
    },
    [authManager]
  );

  const handleSave = () => {
    if (!selectedAccount) return;
    const selectedConfigs = availableLists
      .filter(list => selection.has(list.id))
      .map(list => ({
        id: list.id,
        name: list.title,
        color: ''
      }));
    onSave(selectedConfigs, selectedAccount.id);
    onClose();
  };

  useEffect(() => {
    if (view !== 'account-select' || !accountListRef.current) return;
    const container = accountListRef.current;
    container.empty();

    accounts.forEach(account => {
      new Setting(container)
        .setName(account.email)
        .addButton(button =>
          button
            .setButtonText(t('googleTasks.buttons.selectLists'))
            .onClick(() => handleSelectAccount(account))
        );
    });

    new Setting(container).setName(t('google.selectAccount.title')).addButton(button =>
      button
        .setButtonText(t('google.buttons.connectAccount'))
        .setCta()
        .onClick(() => startGoogleLogin(plugin))
    );
  }, [accounts, handleSelectAccount, plugin, view]);

  useEffect(() => {
    if (view !== 'list-select' || !taskListRef.current) return;
    const container = taskListRef.current;
    container.empty();

    availableLists.forEach(list => {
      new Setting(container).setName(list.title).addToggle(toggle => {
        toggle.setValue(selection.has(list.id)).onChange(value => {
          setSelection(previous => {
            const next = new Set(previous);
            if (value) next.add(list.id);
            else next.delete(list.id);
            return next;
          });
        });
      });
    });
  }, [availableLists, selection, view]);

  if (isLoading) return <div>{t('google.loading')}</div>;

  if (view === 'account-select') {
    return (
      <div>
        <div className="setting-item setting-item-heading">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('googleTasks.selectAccount.title')}</div>
            <div className="setting-item-description">
              {t('googleTasks.selectAccount.description')}
            </div>
          </div>
        </div>
        {error && <p className="mod-warning">{error}</p>}
        <div ref={accountListRef}></div>
      </div>
    );
  }

  return (
    <div>
      <div className="setting-item setting-item-heading">
        <div className="setting-item-info">
          <div className="setting-item-name">
            {t('googleTasks.selectLists.title', { email: selectedAccount?.email ?? '' })}
          </div>
          <div className="setting-item-description">
            {availableLists.length === 0
              ? t('googleTasks.selectLists.noLists')
              : t('googleTasks.selectLists.description')}
          </div>
        </div>
      </div>
      <div ref={taskListRef}></div>
      <div className="setting-item">
        <div className="setting-item-control">
          <button onClick={() => setView('account-select')}>
            {t('google.buttons.backToAccounts')}
          </button>
          <button className="mod-cta u-ml-auto" onClick={handleSave} disabled={selection.size === 0}>
            {selection.size === 1
              ? t('googleTasks.buttons.addLists', { count: selection.size })
              : t('googleTasks.buttons.addListsPlural', { count: selection.size })}
          </button>
        </div>
      </div>
    </div>
  );
};
