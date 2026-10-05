import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import App from '../src/App.vue';
import PromptForm from '../src/components/PromptForm.vue';
import AccessibilityReport from '../src/components/AccessibilityReport.vue';
import * as api from '../src/api.js';
import { setLocale } from '../src/i18n.js';

const okValidation = {
  passed: true,
  attempts: 0,
  remainingIssues: [],
  accessibility: { passed: true },
  responsive: { passed: true },
  site: { passed: true, issues: [] },
};

const site = {
  sessionId: 's1',
  css: 'body{}',
  pages: [
    { slug: 'index', title: 'Home - Studio', html: '<h1>Home</h1><a href="about.html">About</a>', css: '' },
    { slug: 'about', title: 'About us - Studio', html: '<h1>About</h1>', css: '' },
    { slug: 'contact', title: 'Contact - Studio', html: '<h1>Contact</h1>', css: '' },
  ],
  validation: okValidation,
};

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  setLocale('en');
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

// Every mounted App listens to the address hash, so each one is removed after its test.
const mounted = [];
const mountApp = (options) => {
  const wrapper = mount(App, options);
  mounted.push(wrapper);
  return wrapper;
};

afterEach(() => {
  while (mounted.length) mounted.pop().unmount();
  window.history.replaceState({}, '', '/');
});

async function generate(wrapper, text = 'a website for a studio') {
  await wrapper.find('textarea').setValue(text);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('App with a several-page website', () => {
  it('shows a tab for every page, opens on the home page, and switches page on a tab click', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue(site);
    const wrapper = mountApp();
    await generate(wrapper);

    const tabs = wrapper.findAll('.live-preview__tab');
    expect(tabs.map((t) => t.text())).toEqual(['Home', 'About us', 'Contact']);
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>Home</h1>');

    await tabs[2].trigger('click');
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>Contact</h1>');
  });

  it('switches page when a menu link inside the preview changes the address hash, then clears the hash', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue(site);
    const wrapper = mountApp({ attachTo: document.body });
    await generate(wrapper);

    window.location.hash = '#page=about';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushPromises();

    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>About</h1>');
    expect(window.location.hash).toBe(''); // cleared, so the same link works again
  });

  it('ignores a hash for a page that does not exist', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue(site);
    const wrapper = mountApp({ attachTo: document.body });
    await generate(wrapper);

    window.location.hash = '#page=nowhere';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushPromises();
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>Home</h1>');
  });

  it('sends the page being viewed with a change, and stays on it afterwards', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue(site);
    const refine = vi.spyOn(api, 'refinePage').mockResolvedValue({
      ...site,
      pages: site.pages.map((p) => (p.slug === 'contact' ? { ...p, html: '<h1>Contact us</h1>' } : p)),
      iterationsUsed: 2,
      iterationsLimit: 15,
    });
    const wrapper = mountApp();
    await generate(wrapper);
    await wrapper.findAll('.live-preview__tab')[2].trigger('click');

    await generate(wrapper, 'make the heading friendlier');
    expect(refine).toHaveBeenCalledWith('s1', 'make the heading friendlier', expect.objectContaining({ currentPage: 'contact' }));
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>Contact us</h1>');
  });

  it('goes back to the home page when the page being viewed no longer exists', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue(site);
    vi.spyOn(api, 'refinePage').mockResolvedValue({
      ...site,
      pages: site.pages.filter((p) => p.slug !== 'contact'),
      iterationsUsed: 2,
      iterationsLimit: 15,
    });
    const wrapper = mountApp();
    await generate(wrapper);
    await wrapper.findAll('.live-preview__tab')[2].trigger('click');
    await generate(wrapper, 'remove the contact page');

    expect(wrapper.findAll('.live-preview__tab')).toHaveLength(2);
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>Home</h1>');
  });

  it('a new website opens on its home page even if the old one was on another page', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue(site);
    const wrapper = mountApp();
    await generate(wrapper);
    await wrapper.findAll('.live-preview__tab')[1].trigger('click');

    await wrapper.find('.app__new-page').trigger('click');
    await generate(wrapper, 'another site');
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>Home</h1>');
  });

  it('offers the ZIP download for several pages and the plain download for one', async () => {
    const generatePage = vi.spyOn(api, 'generatePage').mockResolvedValue(site);
    const wrapper = mountApp();
    await generate(wrapper);
    expect(wrapper.find('.app__download').text()).toContain('ZIP');

    await wrapper.find('.app__new-page').trigger('click');
    generatePage.mockResolvedValue({ ...site, pages: site.pages.slice(0, 1) });
    await generate(wrapper, 'a landing page');
    expect(wrapper.find('.app__download').text()).not.toContain('ZIP');
  });

  it('restores a saved several-page site after a reload', async () => {
    window.localStorage.setItem('gaw.sessionId', 's1');
    vi.spyOn(api, 'getSession').mockResolvedValue({
      history: [{ prompt: 'a studio', css: site.css, pages: site.pages, validation: okValidation, rationale: null, placeholders: [] }],
      iterationsUsed: 1,
      iterationsLimit: 15,
    });
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.findAll('.live-preview__tab')).toHaveLength(3);
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('<h1>Home</h1>');
  });
});

describe('the page limit message', () => {
  it('is translated from the backend code, in English and in Greek', async () => {
    vi.spyOn(api, 'generatePage').mockResolvedValue(site);
    vi.spyOn(api, 'refinePage').mockRejectedValue(
      Object.assign(new Error('That change would make the website longer than 5 pages'), { code: 'PAGE_LIMIT' })
    );
    const wrapper = mountApp();
    await generate(wrapper);
    await generate(wrapper, 'add a blog page');
    expect(wrapper.find('.app__error').text()).toContain('at most 5 pages');
    await wrapper.find('.lang__btn[lang="el"]').trigger('click');
    expect(wrapper.find('.app__error').text()).toContain('το πολύ 5 σελίδες');
    setLocale('en');
  });
});

describe('PromptForm progress texts for a website', () => {
  const mountWith = (stage) => mount(PromptForm, { props: { loading: true, stage } });

  it('shows the planning step and the number of pages that are ready', () => {
    expect(mountWith({ stage: 'planning' }).find('.prompt-form__stage').text()).toContain('Planning your website');
    expect(mountWith({ stage: 'writing', done: 2, total: 4 }).find('.prompt-form__stage').text()).toBe(
      'Writing the pages (2 of 4 ready)…'
    );
  });

  it('is available in Greek too', () => {
    setLocale('el');
    expect(mountWith({ stage: 'writing', done: 1, total: 3 }).find('.prompt-form__stage').text()).toBe(
      'Γράφω τις σελίδες (1 από 3 έτοιμες)…'
    );
    setLocale('en');
  });
});

describe('AccessibilityReport for a website', () => {
  it('shows the "pages work together" line only when the result has a site check', () => {
    const withSite = mount(AccessibilityReport, { props: { validation: okValidation } });
    expect(withSite.findAll('.a11y-report__item')).toHaveLength(3);
    expect(withSite.text()).toContain('The pages work together');

    const { site: omitted, ...old } = okValidation; // eslint-disable-line no-unused-vars
    const oldResult = mount(AccessibilityReport, { props: { validation: old } });
    expect(oldResult.findAll('.a11y-report__item')).toHaveLength(2);
  });

  it('flags a failing site check', () => {
    const failing = { ...okValidation, passed: false, site: { passed: false, issues: ['x'] }, remainingIssues: ['[site] broken'] };
    const wrapper = mount(AccessibilityReport, { props: { validation: failing } });
    const icons = wrapper.findAll('.a11y-report__icon').map((i) => i.classes());
    expect(icons[2]).toContain('is-warn');
    expect(wrapper.text()).toContain('[site] broken');
  });
});
