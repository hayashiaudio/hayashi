import { describe, expect, it } from 'vitest';
import { injectMetadata } from './og.js';

describe('injectMetadata', () => {
  const html = '<html><head><title>Test</title></head><body></body></html>';

  it('omits og:image:secure_url for non-https image URLs', () => {
    const result = injectMetadata(html, {
      title: 'Title',
      description: 'Description',
      url: 'http://localhost:3001/',
      image: 'http://localhost:3001/og/home.png',
      secondaryImage: 'http://localhost:3001/og/home.svg',
      imageAlt: 'Alt text',
      type: 'website',
    });

    expect(result).toContain('<meta property="og:image" content="http://localhost:3001/og/home.png" />');
    expect(result).not.toContain('og:image:secure_url');
  });
});
