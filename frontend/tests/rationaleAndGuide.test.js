import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignRationale from '../src/components/DesignRationale.vue';
import PlaceholderGuide from '../src/components/PlaceholderGuide.vue';
import { buildDownloadHtml, buildGuideComment, detectLangAndTitle } from '../src/downloadPage.js';

const rationale = {
  summary: 'Ζεστή, οικεία εικόνα.',
  audience: 'Ντόπιοι και τουρίστες',
  colors: [
    { hex: '#123456', name: 'Βαθύ μπλε', why: 'Εμπιστοσύνη' },
    { hex: null, name: 'Κρεμ', why: 'Ζεστασιά' },
  ],
  typography: 'Serif για τίτλους',
  layout: 'Πρώτα το πρόγραμμα',
  conversion: 'Κουμπί κράτησης στην κορυφή',
};

describe('DesignRationale', () => {
  it('renders nothing when there is no rationale', () => {
    const wrapper = mount(DesignRationale, { props: { rationale: null } });
    expect(wrapper.find('details').exists()).toBe(false);
  });

  it('explains each colour with its reason and only shows a swatch for valid hex values', () => {
    const wrapper = mount(DesignRationale, { props: { rationale } });
    expect(wrapper.text()).toContain('Βαθύ μπλε');
    expect(wrapper.text()).toContain('Εμπιστοσύνη');
    expect(wrapper.text()).toContain('Κουμπί κράτησης στην κορυφή');
    expect(wrapper.findAll('.rationale__swatch')).toHaveLength(1);
  });

  it('states that the rationale is a suggestion, not a measured result', () => {
    const wrapper = mount(DesignRationale, { props: { rationale } });
    expect(wrapper.text()).toContain('πρόταση, όχι μέτρηση');
  });
});

describe('PlaceholderGuide', () => {
  it('lists each placeholder with where / search text / replacement', () => {
    const wrapper = mount(PlaceholderGuide, {
      props: {
        placeholders: [
          { what: 'Τίτλοι ταινιών', where: 'Πρόγραμμα', searchText: 'Casablanca', replaceWith: 'Οι δικές σου προβολές' },
        ],
      },
    });
    expect(wrapper.text()).toContain('Τίτλοι ταινιών');
    expect(wrapper.text()).toContain('Casablanca');
    expect(wrapper.text()).toContain('Οι δικές σου προβολές');
  });

  it('always explains both ways to replace content, and the alt-text tip for photos', () => {
    const wrapper = mount(PlaceholderGuide, { props: { placeholders: [] } });
    expect(wrapper.text()).toContain('με το chat');
    expect(wrapper.text()).toContain('Ctrl');
    expect(wrapper.text()).toContain('alt');
  });

  it('falls back to a generic hint when the AI returned no list', () => {
    const wrapper = mount(PlaceholderGuide, { props: { placeholders: [] } });
    expect(wrapper.text()).toContain('δεν επέστρεψε λίστα');
  });
});

describe('downloadPage', () => {
  it('embeds the guide as a comment and keeps the page valid HTML', () => {
    const out = buildDownloadHtml({
      html: '<h1>Cinema Astra</h1>',
      css: 'body{}',
      placeholders: [{ what: 'Όνομα', where: 'Τίτλος', searchText: 'Cinema Astra', replaceWith: 'Το όνομά σου' }],
    });
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out).toContain('ΟΔΗΓΟΣ');
    expect(out).toContain('Αναζήτηση (Ctrl+F): Cinema Astra');
    expect(out).toContain('<title>Cinema Astra</title>');
  });

  it('cannot be broken out of the comment by "--" or "-->" in placeholder text', () => {
    const comment = buildGuideComment([{ what: 'x --> <script>alert(1)</script>', where: 'a--b' }]);
    const inner = comment.slice(4, -4); // without the <!-- and -->
    expect(inner).not.toContain('--');
    expect(comment.endsWith('-->\n')).toBe(true);
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
