import {
  buildDesignMessages,
  buildRefineMessages,
  buildFixMessages,
  buildPlanMessages,
  buildPageMessages,
  serializeSite,
  PLAN_SYSTEM_PROMPT,
  PAGE_SYSTEM_PROMPT,
  EDIT_SYSTEM_PROMPT,
} from '../src/promptEngineering.js';
import { siteFor, planFor } from './helpers/fakeClaude.js';

const site = siteFor(['index', 'about']);

describe('buildDesignMessages', () => {
  it('forces Greek output for a Greek request, but keeps searchText verbatim', () => {
    const [user] = buildDesignMessages(site, 'σελίδα για θερινό κινηματογράφο');
    expect(user.content).toContain('in Greek');
    expect(user.content).toContain('searchText');
  });

  it('follows the request language for non-Greek requests', () => {
    const [user] = buildDesignMessages(site, 'a page for a bakery');
    expect(user.content).not.toContain('in Greek');
    expect(user.content).toContain('same language as the request');
  });

  it('shows Claude every page of the site', () => {
    const [user] = buildDesignMessages(site, 'a site');
    expect(user.content).toContain('=== PAGE slug="index"');
    expect(user.content).toContain('=== PAGE slug="about"');
  });

  it('ends with the "{" prefill so the answer is parseable JSON', () => {
    const messages = buildDesignMessages(site, 'a page');
    expect(messages[messages.length - 1]).toEqual({ role: 'assistant', content: '{' });
  });
});

describe('buildRefineMessages', () => {
  it('sends the whole current site as context so the change is targeted', () => {
    const [user] = buildRefineMessages(site, 'make it blue', 'about');
    expect(user.content).toContain('=== SHARED CSS ===');
    expect(user.content).toContain('=== PAGE slug="about"');
    expect(user.content).toContain('make it blue');
    expect(user.content).toContain('currently looking at the page "about"');
  });

  it('tells Claude how many of the 5 allowed pages the site already has', () => {
    const [user] = buildRefineMessages(site, 'add a blog');
    expect(user.content).toContain('The website currently has 2 of the 5 pages it is allowed.');
  });

  it('does not mention a viewed page when none is given', () => {
    const [user] = buildRefineMessages(site, 'make it blue');
    expect(user.content).not.toContain('currently looking at');
  });
});

describe('buildFixMessages', () => {
  it('lists every failed check, with its page tag, next to the site', () => {
    const [user] = buildFixMessages(site, ['[accessibility] (page: about) Images must have alternative text']);
    expect(user.content).toContain('- [accessibility] (page: about) Images must have alternative text');
    expect(user.content).toContain('=== PAGE slug="about"');
  });
});

describe('generation prompts', () => {
  it('the plan call asks for the request, and the page call carries the shared design', () => {
    const [planUser] = buildPlanMessages('a site for a dentist');
    expect(planUser.content).toContain('a site for a dentist');

    const plan = planFor(['index', 'contact']);
    const [pageUser] = buildPageMessages('a site for a dentist', plan, plan.pages[1]);
    expect(pageUser.content).toContain('Write the page "contact" now.');
    expect(pageUser.content).toContain(plan.header);
    expect(pageUser.content).toContain(plan.css);
    expect(pageUser.content).toContain('- index:');
  });

  it('lists the section ids a page must contain', () => {
    const plan = planFor(['index']);
    plan.pages[0].anchors = ['prices', 'booking'];
    const [pageUser] = buildPageMessages('x', plan, plan.pages[0]);
    expect(pageUser.content).toContain('Section ids this page must contain: prices, booking');
  });

  it('serializes a site as readable text with every page', () => {
    const text = serializeSite(site);
    expect(text.indexOf('=== SHARED CSS ===')).toBe(0);
    expect(text).toContain('title="About us - Test Studio"');
  });
});

describe('the system prompts', () => {
  it('state the 5-page limit, the one-page case and "not copies of each other"', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('never more than 5');
    expect(PLAN_SYSTEM_PROMPT).toContain('plan exactly ONE page');
    expect(PLAN_SYSTEM_PROMPT).toContain('NOT be copies of each other');
    expect(PAGE_SYSTEM_PROMPT).toContain('Do not reuse the home page');
  });

  it('every generation prompt carries the automatic hard requirements (alt text, responsive, contrast)', () => {
    for (const prompt of [PLAN_SYSTEM_PROMPT, PAGE_SYSTEM_PROMPT, EDIT_SYSTEM_PROMPT]) {
      expect(prompt).toContain('alt attribute');
      expect(prompt).toContain('@media');
      expect(prompt).toContain('4.5:1');
    }
  });

  it('ask for a themed text logo: real text, system fonts only, safe animation, never wider than a phone', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('TEXT LOGO');
    expect(PLAN_SYSTEM_PROMPT).toContain('never an external font');
    expect(PLAN_SYSTEM_PROMPT).toContain('prefers-reduced-motion');
    expect(EDIT_SYSTEM_PROMPT).toContain('text logo');
  });

  it('the edit prompt tells Claude to find the page itself and keep the menu identical', () => {
    expect(EDIT_SYSTEM_PROMPT).toContain('does not name pages');
    expect(EDIT_SYSTEM_PROMPT).toContain('IDENTICAL on every page');
  });
});
