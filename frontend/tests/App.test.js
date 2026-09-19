import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import App from '../src/App.vue';
import * as api from '../src/api.js';

const okValidation = {
  passed: true,
  attempts: 0,
  remainingIssues: [],
  accessibility: { passed: true },
  responsive: { passed: true },
};

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('App', () => {
  it('generates a page, then switches into refine mode after the first response', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue({
      sessionId: 's1',
      html: '<p>v1</p>',
      css: '',
      validation: okValidation,
    });

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery contact page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(api.generatePage).toHaveBeenCalledWith('a bakery contact page');
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<p>v1</p>');
    // Το placeholder του textarea αλλάζει σε refine mode μετά το πρώτο generate
    expect(wrapper.find('textarea').attributes('placeholder')).toContain('κουμπιού');
  });

  it('calls refinePage (not generatePage again) for a follow-up instruction', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue({
      sessionId: 's1',
      html: '<p>v1</p>',
      css: '',
      validation: okValidation,
    });
    vi.spyOn(api, 'refinePage').mockResolvedValue({
      sessionId: 's1',
      html: '<p>v2</p>',
      css: '',
      validation: okValidation,
      iterationsUsed: 2,
      iterationsLimit: 15,
    });

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery contact page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    await wrapper.find('textarea').setValue('make the button green');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(api.refinePage).toHaveBeenCalledWith('s1', 'make the button green');
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<p>v2</p>');
    expect(wrapper.text()).toContain('2 / 15');
  });

  it('undo restores the previous version without calling refinePage/generatePage again', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue({
      sessionId: 's1',
      html: '<p>v1</p>',
      css: '',
      validation: okValidation,
    });
    vi.spyOn(api, 'refinePage').mockResolvedValue({
      sessionId: 's1',
      html: '<p>v2</p>',
      css: '',
      validation: okValidation,
      iterationsUsed: 2,
      iterationsLimit: 15,
    });
    vi.spyOn(api, 'undoPage').mockResolvedValue({
      html: '<p>v1</p>',
      css: '',
      validation: okValidation,
      iterationsUsed: 2,
      iterationsLimit: 15,
    });

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery contact page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await wrapper.find('textarea').setValue('make the button green');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    await wrapper.find('button.refinement-panel__undo').trigger('click');
    await flushPromises();

    expect(api.undoPage).toHaveBeenCalledWith('s1');
    // Το undo δεν «επιστρέφει» iterations: ο μετρητής μένει 2 όπως τον αναφέρει το backend
    expect(wrapper.text()).toContain('2 / 15');
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<p>v1</p>');
    expect(api.generatePage).toHaveBeenCalledTimes(1);
    expect(api.refinePage).toHaveBeenCalledTimes(1);
  });

  it('shows the design rationale and placeholder guide from the response, and clears them on new page', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue({
      sessionId: 's1',
      html: '<h1>Cinema</h1>',
      css: '',
      validation: okValidation,
      rationale: { summary: 'Νυχτερινή ατμόσφαιρα', colors: [], typography: '', layout: '', conversion: '', audience: '' },
      placeholders: [{ what: 'Τίτλοι ταινιών', where: 'Πρόγραμμα', searchText: '', replaceWith: 'Δικές σου' }],
    });

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('θερινός κινηματογράφος');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Νυχτερινή ατμόσφαιρα');
    expect(wrapper.text()).toContain('Τίτλοι ταινιών');

    await wrapper.find('.app__new-page').trigger('click');
    expect(wrapper.text()).not.toContain('Νυχτερινή ατμόσφαιρα');
    expect(wrapper.find('.guide').exists()).toBe(false);
  });

  it('"Νέα σελίδα" resets everything so the next prompt calls generatePage again', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue({
      sessionId: 's1',
      html: '<p>v1</p>',
      css: '',
      validation: okValidation,
    });
    vi.spyOn(api, 'refinePage');

    const wrapper = mount(App);
    expect(wrapper.find('.app__new-page').exists()).toBe(false);

    await wrapper.find('textarea').setValue('a bakery contact page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.app__new-page').exists()).toBe(true);

    await wrapper.find('.app__new-page').trigger('click');
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('.app__new-page').exists()).toBe(false);

    await wrapper.find('textarea').setValue('a gym homepage');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(api.generatePage).toHaveBeenCalledTimes(2);
    expect(api.refinePage).not.toHaveBeenCalled();
  });

  it('shows the error message when generatePage rejects', async () => {
    vi.spyOn(api, 'generatePage').mockRejectedValue(new Error('Claude returned non-JSON output'));

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery contact page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Claude returned non-JSON output');
  });

  describe('session persistence across reloads', () => {
    const savedSession = {
      history: [
        { prompt: 'a bakery page', html: '<h1>Bakery</h1>', css: 'h1{}', validation: okValidation, rationale: null, placeholders: [] },
        {
          prompt: 'make it blue',
          html: '<h1>Blue Bakery</h1>',
          css: 'h1{color:blue}',
          validation: okValidation,
          rationale: { summary: 'Γαλάζιο concept', colors: [], typography: '', layout: '', conversion: '', audience: '' },
          placeholders: [{ what: 'Όνομα', where: 'Τίτλος', searchText: 'Bakery', replaceWith: 'Δικό σου' }],
        },
      ],
      iterationsUsed: 2,
      iterationsLimit: 15,
    };

    it('remembers the sessionId after generating', async () => {
      vi.spyOn(api, 'generatePage').mockResolvedValue({ sessionId: 's-42', html: '<p>v1</p>', css: '', validation: okValidation });
      const wrapper = mount(App);
      await wrapper.find('textarea').setValue('a bakery page');
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      expect(window.localStorage.getItem('gaw.sessionId')).toBe('s-42');
    });

    it('restores the latest version, history, counter, rationale and guide after a reload', async () => {
      window.localStorage.setItem('gaw.sessionId', 's-42');
      vi.spyOn(api, 'getSession').mockResolvedValue(savedSession);

      const wrapper = mount(App);
      await flushPromises();

      expect(api.getSession).toHaveBeenCalledWith('s-42');
      expect(wrapper.find('iframe').attributes('srcdoc')).toContain('Blue Bakery');
      expect(wrapper.text()).toContain('make it blue');
      expect(wrapper.text()).toContain('2 / 15');
      expect(wrapper.text()).toContain('Γαλάζιο concept');
      expect(wrapper.text()).toContain('Συνεχίζεις από εκεί που είχες μείνει');
      // επόμενο κείμενο = αλλαγή της ίδιας σελίδας, όχι νέα σελίδα
      expect(wrapper.find('textarea').attributes('placeholder')).toContain('κουμπιού');
    });

    it('forgets a session the server no longer has (404) and tells the user', async () => {
      window.localStorage.setItem('gaw.sessionId', 'gone');
      vi.spyOn(api, 'getSession').mockRejectedValue(Object.assign(new Error('Unknown sessionId'), { status: 404 }));

      const wrapper = mount(App);
      await flushPromises();

      expect(window.localStorage.getItem('gaw.sessionId')).toBeNull();
      expect(wrapper.text()).toContain('δεν βρέθηκε πια');
      expect(wrapper.find('iframe').exists()).toBe(false);
    });

    it('keeps the id when the backend is merely unreachable, so a later reload can recover', async () => {
      window.localStorage.setItem('gaw.sessionId', 's-42');
      vi.spyOn(api, 'getSession').mockRejectedValue(new TypeError('Failed to fetch'));

      const wrapper = mount(App);
      await flushPromises();

      expect(window.localStorage.getItem('gaw.sessionId')).toBe('s-42');
      expect(wrapper.text()).toContain('ο server δεν απαντά');
    });

    it('does not call the backend when nothing was saved', async () => {
      vi.spyOn(api, 'getSession');
      mount(App);
      await flushPromises();
      expect(api.getSession).not.toHaveBeenCalled();
    });

    it('"Νέα σελίδα" forgets the saved session', async () => {
      window.localStorage.setItem('gaw.sessionId', 's-42');
      vi.spyOn(api, 'getSession').mockResolvedValue(savedSession);
      const wrapper = mount(App);
      await flushPromises();

      await wrapper.find('.app__new-page').trigger('click');
      expect(window.localStorage.getItem('gaw.sessionId')).toBeNull();
    });
  });
});
