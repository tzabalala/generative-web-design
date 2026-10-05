import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import App from '../src/App.vue';
import PromptForm from '../src/components/PromptForm.vue';
import * as api from '../src/api.js';
import { setLocale } from '../src/i18n.js';
import { newRequestId } from '../src/requestId.js';
import { getParticipantCode } from '../src/studyContext.js';

const okValidation = {
  passed: true, attempts: 0, remainingIssues: [], accessibility: { passed: true }, responsive: { passed: true },
};

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  setLocale('en');
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

describe('newRequestId', () => {
  it('produces unique ids the backend accepts, without crypto.randomUUID', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('still works when crypto.getRandomValues is unavailable', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(newRequestId()).toMatch(/^r[0-9a-f]{24}$/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('getParticipantCode', () => {
  it('reads a short anonymous code from ?p=', () => {
    expect(getParticipantCode('?p=P03')).toBe('P03');
    expect(getParticipantCode('?x=1&p=user_7')).toBe('user_7');
  });

  it('ignores a missing, empty or unsafe value', () => {
    for (const search of ['', '?p=', '?p=Jane%20Doe', '?p=a@b.com', '?p=' + 'A'.repeat(25), '?q=P03']) {
      expect(getParticipantCode(search)).toBeNull();
    }
  });
});

describe('PromptForm stage text', () => {
  it('shows the current step in addition to the general waiting message', () => {
    const wrapper = mount(PromptForm, {
      props: { loading: true, stage: { stage: 'fixing', attempt: 2, max: 3 } },
    });
    expect(wrapper.find('.prompt-form__stage').text()).toBe('Fixing a problem the checks found (fix 2 of 3)…');
    expect(wrapper.text()).toContain('Working on it');
  });

  it('shows each known step, and nothing for an unknown or missing one', async () => {
    const wrapper = mount(PromptForm, { props: { loading: true } });
    expect(wrapper.find('.prompt-form__stage').exists()).toBe(false);

    for (const name of ['generating', 'checking', 'designing', 'cached']) {
      await wrapper.setProps({ stage: { stage: name } });
      expect(wrapper.find('.prompt-form__stage').text().length).toBeGreaterThan(5);
    }
    await wrapper.setProps({ stage: { stage: 'some-future-step' } });
    expect(wrapper.find('.prompt-form__stage').exists()).toBe(false);
  });

  it('is translated', async () => {
    setLocale('el');
    const wrapper = mount(PromptForm, { props: { loading: true, stage: { stage: 'designing' } } });
    expect(wrapper.find('.prompt-form__stage').text()).toContain('σημειώσεις σχεδιασμού');
  });
});

describe('App: live progress while waiting', () => {
  it('polls the backend with the same request id it sent, shows the step, and stops afterwards', async () => {
    vi.useFakeTimers();
    let finish;
    const gen = vi.spyOn(api, 'generatePage').mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const progress = vi.spyOn(api, 'getProgress').mockResolvedValue({ stage: 'checking', attempt: 0, max: 3 });

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery page');
    await wrapper.find('form').trigger('submit');

    await vi.advanceTimersByTimeAsync(1700);
    await flushPromises();

    const sentId = gen.mock.calls[0][1].requestId;
    expect(progress).toHaveBeenCalledWith(sentId);
    expect(progress.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(wrapper.find('.prompt-form__stage').text()).toContain('Checking accessibility');

    finish({ sessionId: 's1', pages: [{ slug: 'index', title: '', html: '<p>v1</p>', css: '' }], css: '', validation: okValidation });
    await flushPromises();
    expect(wrapper.find('.prompt-form__stage').exists()).toBe(false);

    const callsAfterFinish = progress.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(progress.mock.calls.length).toBe(callsAfterFinish); // polling stopped
  });

  it('keeps working when a progress poll fails', async () => {
    vi.useFakeTimers();
    let finish;
    vi.spyOn(api, 'generatePage').mockReturnValue(new Promise((resolve) => (finish = resolve)));
    vi.spyOn(api, 'getProgress').mockRejectedValue(new TypeError('Failed to fetch'));

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery page');
    await wrapper.find('form').trigger('submit');
    await vi.advanceTimersByTimeAsync(2000);

    finish({ sessionId: 's1', pages: [{ slug: 'index', title: '', html: '<p>v1</p>', css: '' }], css: '', validation: okValidation });
    await flushPromises();
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<p>v1</p>');
    expect(wrapper.find('.app__error').exists()).toBe(false);
  });
});

describe('App: participant code from the URL', () => {
  it('sends ?p=P07 with the first request only when valid', async () => {
    window.history.replaceState({}, '', '/?p=P07');
    const gen = vi.spyOn(api, 'generatePage').mockResolvedValue({
      sessionId: 's1', pages: [{ slug: 'index', title: '', html: '<p>v1</p>', css: '' }], css: '', validation: okValidation,
    });
    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(gen.mock.calls[0][1].participant).toBe('P07');
  });

  it('sends no participant when the URL has none', async () => {
    const gen = vi.spyOn(api, 'generatePage').mockResolvedValue({
      sessionId: 's1', pages: [{ slug: 'index', title: '', html: '<p>v1</p>', css: '' }], css: '', validation: okValidation,
    });
    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(gen.mock.calls[0][1].participant).toBeUndefined();
  });
});
