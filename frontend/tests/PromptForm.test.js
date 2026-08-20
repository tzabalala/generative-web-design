import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PromptForm from '../src/components/PromptForm.vue';

describe('PromptForm', () => {
  it('emits submit with the trimmed text and clears the input', async () => {
    const wrapper = mount(PromptForm, { props: { mode: 'generate' } });
    const textarea = wrapper.find('textarea');
    await textarea.setValue('  a bakery contact page  ');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toEqual([['a bakery contact page']]);
    expect(textarea.element.value).toBe('');
  });

  it('does not emit submit for whitespace-only text', async () => {
    const wrapper = mount(PromptForm, { props: { mode: 'generate' } });
    await wrapper.find('textarea').setValue('    ');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('disables the textarea and button while loading', () => {
    const wrapper = mount(PromptForm, { props: { mode: 'generate', loading: true } });
    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('shows refine-specific copy when mode is "refine"', () => {
    const wrapper = mount(PromptForm, { props: { mode: 'refine' } });
    expect(wrapper.text()).toContain('Τι θέλεις να αλλάξεις;');
  });
});
