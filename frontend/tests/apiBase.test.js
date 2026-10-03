import { describe, it, expect } from 'vitest';
import { resolveApiBase } from '../src/apiBase.js';

const at = (protocol, hostname) => ({ protocol, hostname });

describe('resolveApiBase', () => {
  it('uses the same machine that served the page, on port 3000', () => {
    expect(resolveApiBase({}, at('http:', 'localhost'))).toBe('http://localhost:3000');
  });

  it('follows the page to a LAN address, so a phone talks to the laptop and not to itself', () => {
    expect(resolveApiBase({}, at('http:', '192.168.1.20'))).toBe('http://192.168.1.20:3000');
  });

  it('lets VITE_API_BASE_URL win, and tidies a trailing slash', () => {
    expect(resolveApiBase({ VITE_API_BASE_URL: 'http://127.0.0.1:3199/' }, at('http:', 'localhost'))).toBe(
      'http://127.0.0.1:3199'
    );
  });

  it('falls back to localhost when there is no page address at all', () => {
    expect(resolveApiBase({}, null)).toBe('http://localhost:3000');
  });
});
