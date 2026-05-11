import { describe, expect, test } from 'bun:test';

import { sanitizeOutboundHtml } from '@/lib/services/compose-sanitize';

describe('sanitizeOutboundHtml', () => {
  test('removes scriptable markup and dangerous URLs without DOMPurify', () => {
    const clean = sanitizeOutboundHtml(
      [
        '<p onclick="alert(1)">Hello</p>',
        '<img src="javascript:alert(1)" onerror="alert(2)">',
        '<a href="vbscript:msgbox(1)">bad</a>',
        '<script>alert(3)</script>',
      ].join('')
    );

    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('vbscript:');
    expect(clean).not.toContain('<script');
    expect(clean).toContain('<p>Hello</p>');
  });

  test('sanitizes style content that can load external or scriptable resources', () => {
    const clean = sanitizeOutboundHtml(
      [
        '<style>@import url("https://example.com/x.css"); .x{background:url(javascript:alert(1)); color: red;}</style>',
        '<p style="background:url(https://example.com/image.png); expression(alert(1)); color: blue">Hello</p>',
      ].join('')
    );

    expect(clean).not.toContain('@import');
    expect(clean).not.toContain('url(');
    expect(clean).not.toContain('expression');
    expect(clean).toContain('color: red');
    expect(clean).toContain('color: blue');
  });

  test('keeps iframes from allowed domains and removes other iframe sources', () => {
    const clean = sanitizeOutboundHtml(
      [
        '<iframe src="https://www.youtube.com/embed/video" width="560" onload="alert(1)"></iframe>',
        '<iframe src="https://evil.example/embed/video"></iframe>',
      ].join('')
    );

    expect(clean).toContain('<iframe src="https://www.youtube.com/embed/video" width="560"></iframe>');
    expect(clean).not.toContain('evil.example');
    expect(clean).not.toContain('onload');
  });
});
