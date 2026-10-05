import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LivePreview from '../src/components/LivePreview.vue';

const site = {
  css: 'body{margin:0}',
  pages: [
    { slug: 'index', title: 'Home - Studio', html: '<h1>Home</h1><a href="about.html">About</a>', css: '.home{}' },
    { slug: 'about', title: 'About us - Studio', html: '<h1>About</h1>', css: '' },
  ],
};

describe('LivePreview', () => {
  it('shows the empty state when there are no pages yet', () => {
    const wrapper = mount(LivePreview, { props: { pages: [], css: '' } });
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.text()).toContain('The preview will appear here');
  });

  it('renders an iframe with the page html and the shared + page css combined into srcdoc', () => {
    const wrapper = mount(LivePreview, { props: { pages: site.pages.slice(0, 1), css: site.css } });
    const srcdoc = wrapper.find('iframe').attributes('srcdoc');
    expect(srcdoc).toContain('<h1>Home</h1>');
    expect(srcdoc).toContain('body{margin:0}');
    expect(srcdoc).toContain('.home{}');
    expect(srcdoc).toContain('<title>Home - Studio</title>');
  });

  it('does not allow scripts in the sandboxed iframe (only a user click may change the top address)', () => {
    const wrapper = mount(LivePreview, { props: site });
    const sandbox = wrapper.find('iframe').attributes('sandbox');
    expect(sandbox).not.toContain('allow-scripts');
    expect(sandbox).toContain('allow-top-navigation-by-user-activation');
    expect(sandbox).not.toMatch(/allow-top-navigation(?!-by)/);
  });

  it('has no tabs for a one-page site, and one tab per page for a several-page site', () => {
    const one = mount(LivePreview, { props: { pages: site.pages.slice(0, 1), css: site.css } });
    expect(one.find('.live-preview__tabs').exists()).toBe(false);

    const many = mount(LivePreview, { props: site });
    const tabs = many.findAll('.live-preview__tab');
    expect(tabs.map((t) => t.text())).toEqual(['Home', 'About us']);
    expect(tabs[0].attributes('aria-current')).toBe('page');
    expect(tabs[1].attributes('aria-current')).toBeUndefined();
  });

  it('shows the selected page, and tells the parent when a tab is clicked', async () => {
    const wrapper = mount(LivePreview, { props: { ...site, activeSlug: 'about' } });
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>About</h1>');
    expect(wrapper.findAll('.live-preview__tab')[1].attributes('aria-current')).toBe('page');

    await wrapper.findAll('.live-preview__tab')[0].trigger('click');
    expect(wrapper.emitted('select')).toEqual([['index']]);
  });

  it('falls back to the home page when the selected page does not exist (any more)', () => {
    const wrapper = mount(LivePreview, { props: { ...site, activeSlug: 'gone' } });
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>Home</h1>');
  });

  it('turns links between pages into links that change only the address hash of the app', () => {
    const wrapper = mount(LivePreview, { props: site });
    const srcdoc = wrapper.find('iframe').attributes('srcdoc');
    expect(srcdoc).toContain('#page=about');
    expect(srcdoc).toContain('target="_top"');
    expect(srcdoc).not.toContain('href="about.html"');
  });
});
