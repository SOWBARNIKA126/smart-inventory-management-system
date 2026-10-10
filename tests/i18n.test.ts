import {afterEach, describe, expect, it, vi} from 'vitest';
import {browserLocale, isLocale, languages} from '../src/lib/i18n/config';
import {catalogs, translate} from '../src/lib/i18n/translate';
import {formatters} from '../src/lib/i18n/format';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';

afterEach(() => vi.unstubAllGlobals());
describe('Language catalogs', () => {
  it('supports exactly the nine requested languages', () => {
    expect(languages.map(language => language.code)).toEqual(['en','hi','ta','te','kn','ml','mr','bn','gu']);
    expect(isLocale('fr')).toBe(false);
  });
  for (const {code} of languages) it(`${code} has complete messages and preserves interpolation slots`, () => {
    expect(Object.keys(catalogs[code]).sort()).toEqual(Object.keys(catalogs.en).sort());
    for (const [key, value] of Object.entries(catalogs[code])) {
      expect(value.trim(), `${code}: ${key}`).not.toBe('');
      expect((value.match(/\{\d+\}/g) || []).sort(), `${code}: ${key}`).toEqual((key.match(/\{\d+\}/g) || []).sort());
    }
    if (code !== 'en') for (const label of ['Dashboard','Language','Save settings','Create order']) {
      expect(translate(code, label)).not.toBe(label);
    }
  });
});

describe('Translation boundaries', () => {
  it('preserves names even when a name collides with another UI message', () => {
    expect(translate('hi', 'View {0}', ['demand forecast'])).toContain('demand forecast');
    expect(translate('ta', 'Supplier: {0}', ['Products'])).toContain('Products');
    expect(translate('en', 'Page {0} of {1}', [2, 4])).toBe('Page 2 of 4');
  });
  it('handles enum spelling and falls back safely on unknown strings', () => {
    expect(translate('hi', 'LOW_STOCK')).toBe(translate('hi', 'Low stock'));
    expect(translate('hi', 'CUSTOM_SKU_123')).toBe('CUSTOM_SKU_123');
    expect(translate('en', '  Pending  ')).toBe('  Pending  ');
  });
  it('localizes month and comparison slots in generated forecast messages', () => {
    const result = translate('bn', 'March has the highest observed daily demand (20 units), 15% above the historical daily average.');
    expect(result).not.toMatch(/March|above|highest/);
    expect(result).toContain('মার্চ');
    const period = translate('hi', 'Demand during March–May is historically 20% above the daily average, based on 95 observed days.');
    expect(period).not.toMatch(/March|May|above/);
  });
  it('uses a validated browser preference and defaults to English', () => {
    expect(browserLocale()).toBe('en');
    vi.stubGlobal('document', {cookie: 'other=123; stockwise_language=ta'});
    expect(browserLocale()).toBe('ta');
    vi.stubGlobal('document', {cookie: 'stockwise_language=invalid'});
    expect(browserLocale()).toBe('en');
  });
  it('formats Bengali digits and preserves the configured currency', () => {
    const {number, currency, date} = formatters('bn');
    expect(number(1234)).toBe('১,২৩৪');
    expect(currency(1234)).toContain('₹');
    expect(date('2026-09-09T22:00:00Z')).toContain('১০'); // next day in IST
  });
});

it('keeps option submission values explicit and React elements outside translation calls', () => {
  const failures: string[] = [];
  function scan(dir: string) {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) { scan(file); continue; }
      if (!file.endsWith('.tsx')) continue;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function jsx(node: ts.Node): boolean { return ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node) || !!ts.forEachChild(node, jsx); }
      function visit(node: ts.Node) {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'option' && !node.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === 'value')) failures.push(`${file}: option without stable value`);
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments.some(jsx)) failures.push(`${file}: React content passed to t`);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan('src/app'); scan('src/components');
  expect(failures).toEqual([]);
});
