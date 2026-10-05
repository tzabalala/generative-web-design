import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import RefinementPanel from '../src/components/RefinementPanel.vue';
import PromptForm from '../src/components/PromptForm.vue';
import ThemeToggle from '../src/components/ThemeToggle.vue';
import App from '../src/App.vue';
import { messages, setLocale } from '../src/i18n.js';
import { theme, setTheme, toggleTheme } from '../src/theme.js';

beforeEach(() => {
  window.localStorage.clear();
  setLocale('en');
  window.localStorage.clear();
  setTheme('light');
  window.localStorage.clear();
});

const ok = { passed: true, remainingIssues: [] };

describe('the history is newest first', () => {
  const history = [
    { prompt: 'first idea text', validation: ok },
    { prompt: 'second change text', validation: ok },
    { prompt: 'third change text', validation: ok },
  ];
  const mountPanel = () => mount(RefinementPanel, { props: { history, iterationsUsed: 3, iterationsLimit: 15, canUndo: true } });

  it('shows the latest change at the very top and the initial request at the bottom', () => {
    const entries = mountPanel().findAll('.refinement-panel__entry');
    expect(entries.map((e) => e.find('.refinement-panel__prompt').text())).toEqual([
      'third change text',
      'second change text',
      'first idea text',
    ]);
    expect(entries[0].text()).toContain('Step 2');
    expect(entries[2].text()).toContain('Your first idea');
  });

  it('marks only the newest entry as the latest, and only when there is more than one', () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll('.refinement-panel__latest')).toHaveLength(1);
    expect(wrapper.findAll('.refinement-panel__entry')[0].find('.refinement-panel__latest').exists()).toBe(true);

    const single = mount(RefinementPanel, { props: { history: [history[0]], iterationsUsed: 1, iterationsLimit: 15 } });
    expect(single.find('.refinement-panel__latest').exists()).toBe(false);
  });

  it('puts the undo button above the list, next to the entry it undoes', () => {
    const html = mountPanel().html();
    expect(html.indexOf('refinement-panel__undo')).toBeLessThan(html.indexOf('refinement-panel__list'));
  });
});

describe('light and dark mode', () => {
  it('toggles the theme on <html>, remembers the choice, and reports it with aria-pressed', async () => {
    const wrapper = mount(ThemeToggle);
    const button = wrapper.find('button');
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(document.documentElement.dataset.theme).toBe('light');

    await button.trigger('click');
    expect(theme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('gaw.theme')).toBe('dark');
    expect(button.attributes('aria-pressed')).toBe('true');

    await button.trigger('click');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignores an unknown theme name, and works when localStorage is blocked', () => {
    setTheme('purple');
    expect(theme.value).toBe('light');

    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => toggleTheme()).not.toThrow();
      expect(document.documentElement.dataset.theme).toBe('dark');
    } finally {
      Storage.prototype.setItem = real;
    }
  });

  it('the label is translated', () => {
    expect(mount(ThemeToggle).text()).toContain('Dark mode');
    setLocale('el');
    expect(mount(ThemeToggle).text()).toContain('Σκούρο θέμα');
  });
});

describe('example ideas for a first-time user', () => {
  it('fills the box with the chosen idea, which enables the button', async () => {
    const wrapper = mount(PromptForm);
    expect(wrapper.find('.prompt-form__submit').attributes('disabled')).toBeDefined();
    const chips = wrapper.findAll('.prompt-form__chip');
    expect(chips).toHaveLength(4);

    await chips[2].trigger('click');
    expect(wrapper.find('textarea').element.value).toBe(chips[2].text());
    expect(wrapper.find('.prompt-form__submit').attributes('disabled')).toBeUndefined();
  });

  it('are shown only before the first website, and not while working', () => {
    expect(mount(PromptForm, { props: { mode: 'refine' } }).find('.prompt-form__examples').exists()).toBe(false);
    expect(mount(PromptForm, { props: { loading: true } }).find('.prompt-form__examples').exists()).toBe(false);
  });
});

describe('the start screen', () => {
  it('explains how it works in three steps before the first website, with a tagline', () => {
    const wrapper = mount(App);
    expect(wrapper.findAll('.how__step')).toHaveLength(3);
    expect(wrapper.find('.app__tagline').text()).toContain('built by AI');
    expect(wrapper.find('.live-preview__empty-title').text()).toBe('Your website will appear here');
  });
});

describe('copy rules', () => {
  it('uses no em dash anywhere in the interface texts, in either language', () => {
    for (const lang of Object.keys(messages)) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value, `${lang}.${key}`).not.toContain('—');
      }
    }
  });
});
