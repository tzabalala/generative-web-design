import { describe, it, expect, afterEach, vi } from 'vitest';
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

  it('has no size buttons before there is a website', () => {
    const wrapper = mount(LivePreview, { props: { pages: [], css: '' } });
    expect(wrapper.find('.live-preview__sizes').exists()).toBe(false);
  });

  it('turns links between pages into links that change only the address hash of the app', () => {
    const wrapper = mount(LivePreview, { props: site });
    const srcdoc = wrapper.find('iframe').attributes('srcdoc');
    expect(srcdoc).toContain('#page=about');
    expect(srcdoc).toContain('target="_top"');
    expect(srcdoc).not.toContain('href="about.html"');
  });
});

describe('LivePreview: the preview at the widths of the layout check', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sizeButtons = (wrapper) => wrapper.findAll('.live-preview__size');

  it('offers Fit, Phone 375, Tablet 768 and Desktop 1280, with Fit (the panel width) chosen at first', () => {
    const wrapper = mount(LivePreview, { props: site });
    const buttons = sizeButtons(wrapper);
    expect(buttons.map((b) => b.text())).toEqual(['Fit', 'Phone 375', 'Tablet 768', 'Desktop 1280']);
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    expect(wrapper.find('.live-preview__sizes').attributes('aria-label')).toBe('Preview size');
    expect(wrapper.find('iframe').attributes('style') ?? '').not.toContain('width');
  });

  it('makes the frame really as wide as the device, so the page media queries respond', async () => {
    const wrapper = mount(LivePreview, { props: site });
    await sizeButtons(wrapper)[1].trigger('click');
    expect(wrapper.find('iframe').attributes('style')).toContain('width: 375px');
    expect(sizeButtons(wrapper)[1].attributes('aria-pressed')).toBe('true');
    expect(sizeButtons(wrapper)[0].attributes('aria-pressed')).toBe('false');

    await sizeButtons(wrapper)[0].trigger('click');
    expect(wrapper.find('iframe').attributes('style') ?? '').not.toContain('width');
  });

  it('scales a frame that is wider than the space down to fit, and says so', async () => {
    // a panel 640 px wide: the 1280 px frame is shown at 50%
    let report;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          report = (width) => callback([{ contentRect: { width } }]);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const wrapper = mount(LivePreview, { props: site });
    report(640);
    await sizeButtons(wrapper)[3].trigger('click');

    const style = wrapper.find('iframe').attributes('style');
    expect(style).toContain('width: 1280px');
    expect(style).toContain('scale(0.5)');
    expect(wrapper.find('.live-preview__note').text()).toBe('Shown 1280 px wide, scaled to 50% to fit.');

    // the phone width fits in 640 px: no scaling, no note
    await sizeButtons(wrapper)[1].trigger('click');
    expect(wrapper.find('iframe').attributes('style')).not.toContain('scale');
    expect(wrapper.find('.live-preview__note').exists()).toBe(false);
  });
});
