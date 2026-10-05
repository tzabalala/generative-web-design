import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { messages, t, tn, translate, setLocale, locale, SUPPORTED_LOCALES } from '../src/i18n.js';
import RichText from '../src/components/RichText.vue';
import LanguageToggle from '../src/components/LanguageToggle.vue';
import App from '../src/App.vue';
import * as api from '../src/api.js';
import { vi } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
  setLocale('en');
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const placeholdersOf = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const markersOf = (text) => ({
  bold: (text.match(/\*\*/g) || []).length,
  code: (text.match(/`/g) || []).length,
  kbd: (text.match(/\[\[/g) || []).length,
});

describe('translation dictionaries', () => {
  it('English and Greek define exactly the same keys (nothing can be forgotten)', () => {
    const en = Object.keys(messages.en).sort();
    const el = Object.keys(messages.el).sort();
    expect(el).toEqual(en);
  });

  it('no message is empty', () => {
    for (const lang of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('every key uses the same {placeholders} in both languages', () => {
    for (const key of Object.keys(messages.en)) {
      expect(placeholdersOf(messages.el[key]), key).toEqual(placeholdersOf(messages.en[key]));
    }
  });

  it('every key has the same inline markup (**bold**, `code`, [[key]]) in both languages', () => {
    for (const key of Object.keys(messages.en)) {
      expect(markersOf(messages.el[key]), key).toEqual(markersOf(messages.en[key]));
    }
  });

  it('the download guide comment can never break out of an HTML comment', () => {
    for (const lang of SUPPORTED_LOCALES) {
      for (const key of Object.keys(messages[lang]).filter((k) => k.startsWith('download.'))) {
        expect(messages[lang][key], `${lang}:${key}`).not.toContain('--');
      }
    }
  });
});

describe('t / tn / translate', () => {
  it('defaults to English', () => {
    expect(locale.value).toBe('en');
    expect(t('app.preview')).toBe('Preview');
  });

  it('interpolates {params} and leaves unknown ones visible', () => {
    expect(t('history.counter', { used: 2, limit: 15 })).toBe('2 / 15 edits');
    expect(t('history.counter', { used: 2 })).toBe('2 / {limit} edits');
  });

  it('tn picks the singular for 1 and the plural otherwise', () => {
    expect(tn('history.issues', 1)).toBe('⚠ 1 issue remains');
    expect(tn('history.issues', 3)).toBe('⚠ 3 issues remain');
    setLocale('el');
    expect(tn('history.issues', 1)).toBe('⚠ 1 πρόβλημα παραμένει');
    expect(tn('history.issues', 3)).toBe('⚠ 3 προβλήματα παραμένουν');
  });

  it('falls back to English for an unsupported locale, and to the key when unknown', () => {
    expect(translate('fr', 'app.preview')).toBe('Preview');
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
  });
});

describe('setLocale', () => {
  it('switches the UI, persists the choice, and updates <html lang>', () => {
    setLocale('el');
    expect(t('app.preview')).toBe('Προεπισκόπηση');
    expect(window.localStorage.getItem('gaw.locale')).toBe('el');
    expect(document.documentElement.lang).toBe('el');
  });

  it('ignores unsupported languages', () => {
    setLocale('fr');
    expect(locale.value).toBe('en');
  });
});

describe('RichText', () => {
  it('renders **bold**, `code` and [[Key]] as real elements', () => {
    const wrapper = mount(RichText, { props: { text: 'Press [[Ctrl]] and edit `src` **now**' } });
    expect(wrapper.find('kbd').text()).toBe('Ctrl');
    expect(wrapper.find('code').text()).toBe('src');
    expect(wrapper.find('strong').text()).toBe('now');
  });

  it('never interprets HTML (no injection through translated text)', () => {
    const wrapper = mount(RichText, { props: { text: '<b>x</b> <img src=x onerror=alert(1)>' } });
    expect(wrapper.find('b').exists()).toBe(false);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('<b>x</b>');
  });
});

describe('LanguageToggle', () => {
  it('marks the active language, switches on click, and labels each option in its own language', async () => {
    const wrapper = mount(LanguageToggle);
    const [en, el] = wrapper.findAll('button');

    expect(en.attributes('aria-pressed')).toBe('true');
    expect(el.attributes('aria-pressed')).toBe('false');
    expect(en.attributes('lang')).toBe('en');
    expect(el.attributes('lang')).toBe('el');
    expect(el.text()).toBe('Ελληνικά');

    await el.trigger('click');
    expect(locale.value).toBe('el');
    expect(el.attributes('aria-pressed')).toBe('true');
  });
});

describe('App with the language toggle', () => {
  it('switches the whole UI to Greek and back', async () => {
    const wrapper = mount(App);
    expect(wrapper.text()).toContain('Create page');

    await wrapper.find('.lang__btn[lang="el"]').trigger('click');
    expect(wrapper.text()).toContain('Δημιουργία σελίδας');
    expect(wrapper.text()).not.toContain('Create page');

    await wrapper.find('.lang__btn[lang="en"]').trigger('click');
    expect(wrapper.text()).toContain('Create page');
  });

  it('re-translates a notice that is already on screen', async () => {
    window.localStorage.setItem('gaw.sessionId', 's-1');
    vi.spyOn(api, 'getSession').mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));

    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.text()).toContain('not found any more');

    await wrapper.find('.lang__btn[lang="el"]').trigger('click');
    expect(wrapper.text()).toContain('δεν βρέθηκε πια');
  });

  it('translates a backend error code, and falls back to the raw message for unknown ones', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue({
      sessionId: 's1',
      pages: [{ slug: 'index', title: '', html: '<p>v1</p>', css: '' }],
      css: '',
      validation: { passed: true, attempts: 0, remainingIssues: [] },
    });
    vi.spyOn(api, 'refinePage').mockRejectedValue(
      Object.assign(new Error('Maximum number of edits (15) reached for this page.'), { code: 'ITERATION_LIMIT' })
    );

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await wrapper.find('textarea').setValue('change it');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.app__error').text()).toContain('maximum number of edits (15)');
    await wrapper.find('.lang__btn[lang="el"]').trigger('click');
    expect(wrapper.find('.app__error').text()).toContain('μέγιστο αριθμό επεξεργασιών (15)');

    api.refinePage.mockRejectedValue(new Error('Claude returned non-JSON output'));
    await wrapper.find('textarea').setValue('again');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.app__error').text()).toContain('Claude returned non-JSON output');
  });
});
