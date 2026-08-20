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
    vi.spyOn(api, 'undoPage').mockResolvedValue({ html: '<p>v1</p>', css: '', validation: okValidation });

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
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<p>v1</p>');
    expect(api.generatePage).toHaveBeenCalledTimes(1);
    expect(api.refinePage).toHaveBeenCalledTimes(1);
  });

  it('shows the error message when generatePage rejects', async () => {
    vi.spyOn(api, 'generatePage').mockRejectedValue(new Error('Claude returned non-JSON output'));

    const wrapper = mount(App);
    await wrapper.find('textarea').setValue('a bakery contact page');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Claude returned non-JSON output');
  });
});
