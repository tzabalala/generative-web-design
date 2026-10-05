import { describe, it, expect } from 'vitest';
import { buildZip, crc32 } from '../src/zip.js';
import { buildDownload, buildSitePageHtml } from '../src/downloadPage.js';

// A reader for the zip format, written independently of the writer: it walks the central
// directory the way an unzip tool does and checks every entry's checksum.
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);

  const files = {};
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50);
    const crc = view.getUint32(pos + 16, true);
    const size = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLen;
    const data = bytes.subarray(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);
    files[name] = decoder.decode(data);
    pos += 46 + nameLen;
  }
  return files;
}

describe('crc32', () => {
  it('matches the well-known check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('buildZip', () => {
  it('round-trips names and contents, including Greek text and empty files', () => {
    const files = [
      { name: 'index.html', content: '<h1>Καλημέρα κόσμε</h1>' },
      { name: 'style.css', content: 'body{}' },
      { name: 'empty.txt', content: '' },
      { name: 'λήψη.txt', content: new Uint8Array([104, 105]) },
    ];
    const read = readZip(buildZip(files));
    expect(read).toEqual({
      'index.html': '<h1>Καλημέρα κόσμε</h1>',
      'style.css': 'body{}',
      'empty.txt': '',
      'λήψη.txt': 'hi',
    });
  });

  it('writes a valid archive for a larger file', () => {
    const big = 'x'.repeat(300000);
    expect(readZip(buildZip([{ name: 'big.txt', content: big }]))['big.txt']).toBe(big);
  });
});

describe('buildSitePageHtml', () => {
  it('links the shared stylesheet, keeps the page css inline, and uses the page title', () => {
    const html = buildSitePageHtml({ page: { slug: 'about', title: 'About <us>', html: '<h1>About</h1>', css: '.a{}' } });
    expect(html).toContain('<link rel="stylesheet" href="style.css">');
    expect(html).toContain('<style>.a{}</style>');
    expect(html).toContain('<title>About &lt;us&gt;</title>');
    expect(html).toContain('<body><h1>About</h1></body>');
  });

  it('adds no inline style for a page without its own css, and falls back to the h1 for the title', () => {
    const html = buildSitePageHtml({ page: { slug: 'x', title: '', html: '<h1>Fallback</h1>', css: '' } });
    expect(html).not.toContain('<style>');
    expect(html).toContain('<title>Fallback</title>');
  });
});

describe('buildDownload', () => {
  const placeholders = [{ what: 'Name', where: 'Home page', searchText: 'Studio', replaceWith: 'Yours' }];

  it('gives a single self-contained html file for a one-page site, with the page css inside', () => {
    const out = buildDownload({
      pages: [{ slug: 'index', title: 'Home', html: '<h1>Home</h1>', css: '.p{}' }],
      css: 'body{}',
      placeholders,
    });
    expect(out.filename).toBe('page.html');
    expect(out.type).toBe('text/html');
    expect(out.data).toContain('body{}\n.p{}');
    expect(out.data).toContain('GUIDE: DUMMY CONTENT TO REPLACE');
  });

  it('gives a zip for a several-page site: one html per page, one style.css, the guide in index.html only', () => {
    const out = buildDownload({
      pages: [
        { slug: 'index', title: 'Home', html: '<h1>Home</h1><a href="about.html">About</a>', css: '' },
        { slug: 'about', title: 'About', html: '<h1>About</h1>', css: '.a{}' },
      ],
      css: 'body{color:#111}',
      placeholders,
      locale: 'en',
    });
    expect(out.filename).toBe('website.zip');
    expect(out.type).toBe('application/zip');

    const files = readZip(out.data);
    expect(Object.keys(files).sort()).toEqual(['about.html', 'index.html', 'style.css']);
    expect(files['style.css']).toBe('body{color:#111}');
    expect(files['index.html']).toContain('GUIDE: DUMMY CONTENT TO REPLACE');
    expect(files['about.html']).not.toContain('GUIDE');
    expect(files['index.html']).toContain('href="about.html"'); // real links, so the files work together
    expect(files['index.html'].startsWith('<!DOCTYPE html>')).toBe(true);
  });
});
