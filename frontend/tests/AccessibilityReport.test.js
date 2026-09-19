import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AccessibilityReport from '../src/components/AccessibilityReport.vue';

describe('AccessibilityReport', () => {
  it('shows a neutral empty state before any validation has run', () => {
    const wrapper = mount(AccessibilityReport, { props: { validation: null } });
    expect(wrapper.text()).toContain('Nothing checked yet');
  });

  it('shows both checks as passing when validation.passed is true', () => {
    const wrapper = mount(AccessibilityReport, {
      props: {
        validation: {
          passed: true,
          attempts: 0,
          remainingIssues: [],
          accessibility: { passed: true },
          responsive: { passed: true },
        },
      },
    });
    expect(wrapper.findAll('.is-warn')).toHaveLength(0);
    expect(wrapper.findAll('.is-ok')).toHaveLength(2);
  });

  it('lists remaining issues in plain language when validation fails', () => {
    const wrapper = mount(AccessibilityReport, {
      props: {
        validation: {
          passed: false,
          attempts: 3,
          remainingIssues: ['[accessibility] Image missing alt text'],
          accessibility: { passed: false },
          responsive: { passed: true },
        },
      },
    });
    expect(wrapper.text()).toContain('Image missing alt text');
  });
});
