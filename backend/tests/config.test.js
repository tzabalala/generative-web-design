import { modelProfile, resolveModel } from '../src/config.js';
import { generateCacheKey } from '../src/cache.js';

const KEYS = ['MODEL_PROFILE', 'CLAUDE_MODEL_DEV', 'CLAUDE_MODEL_DEMO'];
const saved = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('model profile', () => {
  it('defaults to the dev profile with the built-in Haiku model', () => {
    expect(modelProfile()).toBe('dev');
    expect(resolveModel()).toBe('claude-haiku-4-5-20251001');
  });

  it('uses CLAUDE_MODEL_DEV from the environment when set', () => {
    process.env.CLAUDE_MODEL_DEV = 'my-dev-model';
    expect(resolveModel()).toBe('my-dev-model');
  });

  it('switches to the demo model with MODEL_PROFILE=demo', () => {
    process.env.MODEL_PROFILE = 'demo';
    expect(modelProfile()).toBe('demo');
    expect(resolveModel()).toBe('claude-sonnet-5');
    process.env.CLAUDE_MODEL_DEMO = 'my-demo-model';
    expect(resolveModel()).toBe('my-demo-model');
  });

  it('is case-insensitive and ignores blank model variables', () => {
    process.env.MODEL_PROFILE = ' Demo ';
    process.env.CLAUDE_MODEL_DEMO = '   ';
    expect(modelProfile()).toBe('demo');
    expect(resolveModel()).toBe('claude-sonnet-5');
  });

  it('refuses an unknown profile instead of silently using the cheap model', () => {
    process.env.MODEL_PROFILE = 'sonnet';
    expect(() => resolveModel()).toThrow(/MODEL_PROFILE must be "dev" or "demo"/);
  });
});

describe('cache keys and models', () => {
  it('the same prompt gets a different cache key under a different model', () => {
    const dev = generateCacheKey('a bakery page');
    process.env.MODEL_PROFILE = 'demo';
    const demo = generateCacheKey('a bakery page');
    expect(demo).not.toBe(dev);
  });

  it('is stable for the same model', () => {
    expect(generateCacheKey('a bakery page')).toBe(generateCacheKey('  a bakery   page '));
  });
});
