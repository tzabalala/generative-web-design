import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LivePreview from '../src/components/LivePreview.vue';

describe('LivePreview', () => {
  it('shows the empty state when there is no html/css yet', () => {
    const wrapper = mount(LivePreview, { props: { html: '', css: '' } });
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.text()).toContain('The preview will appear here');
  });

  it('renders an iframe with the html/css combined into srcdoc', () => {
    const wrapper = mount(LivePreview, {
      props: { html: '<p>hello</p>', css: 'p{color:red}' },
    });
    const iframe = wrapper.find('iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('srcdoc')).toContain('<p>hello</p>');
    expect(iframe.attributes('srcdoc')).toContain('p{color:red}');
  });

  it('does not allow scripts in the sandboxed iframe', () => {
    const wrapper = mount(LivePreview, { props: { html: '<p>x</p>', css: '' } });
    expect(wrapper.find('iframe').attributes('sandbox')).not.toContain('allow-scripts');
  });
});
