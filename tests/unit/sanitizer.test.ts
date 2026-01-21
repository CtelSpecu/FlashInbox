import { describe, expect, test } from 'bun:test';
import { sanitizeHtml, stripHtml, containsDangerousContent } from '@/workers/email/sanitizer';

describe('HTML sanitizer', () => {
  describe('sanitizeHtml', () => {
    test('removes script tags', () => {
      const html = '<p>Hello</p><script>alert(1)</script><p>World</p>';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('alert');
      expect(clean).toContain('<p>Hello</p>');
      expect(clean).toContain('<p>World</p>');
    });

    test('removes inline event handlers', () => {
      const html = '<div onclick="alert(1)">Click me</div>';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('onclick');
      expect(clean).toContain('Click me');
    });

    test('removes all on* event attributes', () => {
      const events = [
        'onerror', 'onload', 'onclick', 'onmouseover',
        'onmouseout', 'onfocus', 'onblur', 'onsubmit',
      ];
      
      for (const event of events) {
        const html = `<div ${event}="alert(1)">Test</div>`;
        const clean = sanitizeHtml(html);
        expect(clean).not.toContain(event);
      }
    });

    test('removes javascript: URLs from links', () => {
      const html = '<a href="javascript:alert(1)">Click</a>';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('javascript:');
      expect(clean).toContain('Click');
    });

    test('removes vbscript: URLs', () => {
      const html = '<a href="vbscript:MsgBox">Click</a>';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('vbscript:');
    });

    test('preserves safe tags', () => {
      const html = '<p>Para</p><strong>Bold</strong><em>Italic</em><ul><li>Item</li></ul>';
      const clean = sanitizeHtml(html);
      expect(clean).toContain('<p>Para</p>');
      expect(clean).toContain('<strong>Bold</strong>');
      expect(clean).toContain('<em>Italic</em>');
      expect(clean).toContain('<li>Item</li>');
    });

    test('preserves tables', () => {
      const html = '<table><tr><td>Cell</td></tr></table>';
      const clean = sanitizeHtml(html);
      expect(clean).toContain('<table>');
      expect(clean).toContain('<td>Cell</td>');
    });

    test('replaces external images with placeholder by default', () => {
      const html = '<img src="https://example.com/image.jpg" alt="Test">';
      const clean = sanitizeHtml(html);
      // External image src should be replaced with placeholder
      expect(clean).toContain('data:image/svg+xml;base64');
      // Original URL preserved in data attribute for later loading
      expect(clean).toContain('data-original-src="https://example.com/image.jpg"');
      // The src attribute should now be the placeholder
      expect(clean).toMatch(/src="data:image\/svg\+xml;base64,/);
    });

    test('preserves data-original-src for external images', () => {
      const html = '<img src="http://malicious.com/tracking.gif">';
      const clean = sanitizeHtml(html);
      expect(clean).toContain('data-original-src="http://malicious.com/tracking.gif"');
    });

    test('allows inline images when not replacing externals', () => {
      const html = '<img src="https://example.com/image.jpg">';
      const clean = sanitizeHtml(html, { replaceExternalImages: false });
      expect(clean).toContain('src="https://example.com/image.jpg"');
    });

    test('blocks data:text/html URLs', () => {
      const html = '<img src="data:text/html,<script>alert(1)</script>">';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('text/html');
      expect(clean).not.toContain('alert');
    });

    test('allows safe data URLs for images', () => {
      const html = '<img src="data:image/png;base64,iVBORw0KGgo=">';
      const clean = sanitizeHtml(html, { replaceExternalImages: false });
      expect(clean).toContain('data:image/png');
    });

    test('removes style tags', () => {
      const html = '<style>body { display: none; }</style><p>Content</p>';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('<style');
      expect(clean).not.toContain('display: none');
      expect(clean).toContain('<p>Content</p>');
    });

    test('removes iframe tags', () => {
      const html = '<iframe src="https://evil.com"></iframe><p>Content</p>';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('<iframe');
      expect(clean).not.toContain('evil.com');
    });

    test('removes form elements', () => {
      const html = '<form action="/steal"><input type="text"><button>Submit</button></form>';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('<form');
      expect(clean).not.toContain('<input');
      expect(clean).not.toContain('<button');
    });

    test('adds security attributes to external links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const clean = sanitizeHtml(html);
      expect(clean).toContain('target="_blank"');
      expect(clean).toContain('rel="noopener noreferrer nofollow"');
    });

    test('preserves class and id attributes', () => {
      const html = '<div class="container" id="main">Content</div>';
      const clean = sanitizeHtml(html);
      expect(clean).toContain('class="container"');
      expect(clean).toContain('id="main"');
    });

    test('handles empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    test('handles plain text input', () => {
      const text = 'Just plain text without any HTML';
      expect(sanitizeHtml(text)).toBe(text);
    });

    test('handles nested dangerous content', () => {
      const html = '<div><p><a href="javascript:void(0)" onclick="evil()">Nested</a></p></div>';
      const clean = sanitizeHtml(html);
      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('onclick');
    });
  });

  describe('stripHtml', () => {
    test('removes all HTML tags', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const text = stripHtml(html);
      expect(text).toBe('Hello World');
    });

    test('handles nested tags', () => {
      const html = '<div><p>Nested <em>content</em> here</p></div>';
      const text = stripHtml(html);
      expect(text).toBe('Nested content here');
    });

    test('handles empty input', () => {
      expect(stripHtml('')).toBe('');
    });

    test('preserves text content', () => {
      const text = 'Plain text';
      expect(stripHtml(text)).toBe(text);
    });

    test('removes all dangerous elements completely', () => {
      const html = '<script>alert(1)</script>Safe text<style>body{}</style>';
      const text = stripHtml(html);
      expect(text).toBe('Safe text');
    });
  });

  describe('containsDangerousContent', () => {
    test('detects script tags', () => {
      expect(containsDangerousContent('<script>alert(1)</script>')).toBe(true);
      expect(containsDangerousContent('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
    });

    test('detects event handlers', () => {
      expect(containsDangerousContent('<div onclick="alert(1)">')).toBe(true);
      expect(containsDangerousContent('<img onerror="alert(1)">')).toBe(true);
      expect(containsDangerousContent('<body onload="init()">')).toBe(true);
    });

    test('detects javascript: URLs', () => {
      expect(containsDangerousContent('<a href="javascript:alert(1)">')).toBe(true);
      expect(containsDangerousContent('<a href="JAVASCRIPT:alert(1)">')).toBe(true);
    });

    test('detects vbscript: URLs', () => {
      expect(containsDangerousContent('<a href="vbscript:MsgBox">')).toBe(true);
    });

    test('detects data:text/html', () => {
      expect(containsDangerousContent('<img src="data:text/html,">')).toBe(true);
    });

    test('returns false for safe content', () => {
      expect(containsDangerousContent('<p>Hello World</p>')).toBe(false);
      expect(containsDangerousContent('<a href="https://example.com">Link</a>')).toBe(false);
      expect(containsDangerousContent('<img src="https://example.com/img.jpg">')).toBe(false);
    });

    test('handles empty input', () => {
      expect(containsDangerousContent('')).toBe(false);
    });
  });
});

