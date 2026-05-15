import { t } from '../../../../features/i18n/i18n';

export function renderFooter(containerEl: HTMLElement): void {
  const footerEl = containerEl.createDiv({ cls: 'settings-footer' });

  footerEl.createEl('p', {
    text: t('settings.footer.message'),
    cls: 'settings-footer-text'
  });

  const linksContainer = footerEl.createDiv({ cls: 'settings-footer-links' });

  linksContainer.createEl('a', {
    text: t('settings.footer.buyMeACoffee'),
    attr: { href: 'https://ko-fi.com/youfoundjk' },
    cls: 'settings-footer-link'
  });
  linksContainer.createEl('a', {
    text: t('settings.footer.suggestFeature'),
    attr: {
      href: 'https://github.com/EmilyPinhasi/cortex-full-calendar/discussions'
    },
    cls: 'settings-footer-link'
  });
  linksContainer.createEl('a', {
    text: t('settings.footer.raiseIssue'),
    attr: {
      href: 'https://github.com/EmilyPinhasi/cortex-full-calendar/issues/new'
    },
    cls: 'settings-footer-link'
  });
}
