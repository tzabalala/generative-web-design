import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignRationale from '../src/components/DesignRationale.vue';
import PlaceholderGuide from '../src/components/PlaceholderGuide.vue';
import { buildDownloadHtml, buildGuideComment, detectLangAndTitle } from '../src/downloadPage.js';

const rationale = {
  summary: 'Warm, familiar feel.',
  audience: 'Locals and tourists',
  colors: [
    { hex: '#123456', name: 'Deep blue', why: 'Trust' },
    { hex: null, name: 'Cream', why: 'Warmth' },
  ],
  typography: 'Serif for headings',
  layout: 'Schedule first',
  conversion: 'Booking button at the top',
};

describe('DesignRationale', () => {
  it('renders nothing when there is no rationale', () => {
    const wrapper = mount(DesignRationale, { props: { rationale: null } });
    expect(wrapper.find('details').exists()).toBe(false);
  });

  it('explains each colour with its reason and only shows a swatch for valid hex values', () => {
    const wrapper = mount(DesignRationale, { props: { rationale } });
    expect(wrapper.text()).toContain('Deep blue');
    expect(wrapper.text()).toContain('Trust');
    expect(wrapper.text()).toContain('Booking button at the top');
    expect(wrapper.findAll('.rationale__swatch')).toHaveLength(1);
  });

  it('states that the rationale is a suggestion, not a measured result', () => {
    const wrapper = mount(DesignRationale, { props: { rationale } });
    expect(wrapper.text()).toContain('a suggestion, not a performance measurement');
  });
});

describe('PlaceholderGuide', () => {
  it('lists each placeholder with where / search text / replacement', () => {
    const wrapper = mount(PlaceholderGuide, {
      props: {
        placeholders: [
          { what: 'Movie titles', where: 'Schedule', searchText: 'Casablanca', replaceWith: 'Your own screenings' },
        ],
      },
    });
    expect(wrapper.text()).toContain('Movie titles');
    expect(wrapper.text()).toContain('Casablanca');
    expect(wrapper.text()).toContain('Your own screenings');
  });

  it('always explains both ways to replace content, and the alt-text tip for photos', () => {
    const wrapper = mount(PlaceholderGuide, { props: { placeholders: [] } });
    expect(wrapper.text()).toContain('with the chat');
    expect(wrapper.text()).toContain('Ctrl');
    expect(wrapper.text()).toContain('alt');
  });

  it('falls back to a generic hint when the AI returned no list', () => {
    const wrapper = mount(PlaceholderGuide, { props: { placeholders: [] } });
    expect(wrapper.text()).toContain('did not return a list');
  });
});

describe('downloadPage', () => {
  it('embeds the guide as a comment and keeps the page valid HTML', () => {
    const out = buildDownloadHtml({
      html: '<h1>Cinema Astra</h1>',
      css: 'body{}',
      placeholders: [{ what: 'Name', where: 'Title', searchText: 'Cinema Astra', replaceWith: 'Your name' }],
    });
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out).toContain('GUIDE');
    expect(out).toContain('Search (Ctrl+F): Cinema Astra');
    expect(out).toContain('<title>Cinema Astra</title>');
  });

  it('cannot be broken out of the comment by "--" or "-->" in placeholder text', () => {
    const comment = buildGuideComment([{ what: 'x --> <script>alert(1)</script>', where: 'a--b' }]);
    const inner = comment.slice(4, -4); // without the <!-- and -->
    expect(inner).not.toContain('--');
    expect(comment.endsWith('-->\n')).toBe(true);
  });

  it('writes the guide comment in the UI language that was active at download time', () => {
    const placeholders = [{ what: 'Name', where: 'Title', searchText: 'Cinema Astra', replaceWith: 'Your name' }];
    expect(buildGuideComment(placeholders, 'en')).toContain('GUIDE: DUMMY CONTENT TO REPLACE');
    expect(buildGuideComment(placeholders, 'el')).toContain('ΟΔΗΓΟΣ: ΔΟΚΙΜΑΣΤΙΚΑ ΣΤΟΙΧΕΙΑ');
    expect(buildGuideComment(placeholders, 'el')).toContain('Αναζήτηση (Ctrl+F): Cinema Astra');
    expect(buildDownloadHtml({ html: '<h1>x</h1>', css: '', placeholders, locale: 'el' })).toContain('ΟΔΗΓΟΣ');
  });

  it('falls back to a title in the language of the PAGE (not the UI) when there is no h1', () => {
    expect(detectLangAndTitle('<p>Καλημέρα</p>').title).toBe('Η σελίδα μου');
    expect(detectLangAndTitle('<p>Hello</p>').title).toBe('My page');
  });

  it('omits the comment when there are no placeholders', () => {
    expect(buildGuideComment([])).toBe('');
  });

  it('detects Greek vs English content for the html lang attribute', () => {
    expect(detectLangAndTitle('<h1>Καλημέρα</h1>').lang).toBe('el');
    expect(detectLangAndTitle('<h1>Hello</h1>').lang).toBe('en');
    expect(detectLangAndTitle('<p>no heading</p>').title).toBe('My page');
  });
});
