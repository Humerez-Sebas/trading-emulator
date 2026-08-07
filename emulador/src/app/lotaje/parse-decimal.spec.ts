import { describe, expect, it } from 'vitest';
import { parseDecimal } from './parse-decimal';

describe('parseDecimal (F1/F3)', () => {
  it('empty string is NaN, never 0 (F1)', () => {
    expect(parseDecimal('')).toBeNaN();
  });

  it('whitespace-only string is NaN', () => {
    expect(parseDecimal('   ')).toBeNaN();
  });

  it('a plain integer parses', () => {
    expect(parseDecimal('45')).toBe(45);
  });

  it('a dot-decimal parses', () => {
    expect(parseDecimal('2650.50')).toBe(2650.5);
  });

  it('a comma-decimal is normalized to a dot (F3)', () => {
    expect(parseDecimal('2650,50')).toBe(2650.5);
  });

  it('trailing junk after a valid number is NaN, never a truncated prefix (F3)', () => {
    expect(parseDecimal('1.5abc')).toBeNaN();
  });

  it('a second embedded comma is NaN (ambiguous, not a truncated prefix)', () => {
    expect(parseDecimal('1,234,56')).toBeNaN();
  });

  it('a lone "-" is NaN', () => {
    expect(parseDecimal('-')).toBeNaN();
  });

  it('a lone "." mid-typing parses to 0-with-nothing-after — actually NaN check: "1." parses to 1', () => {
    expect(parseDecimal('1.')).toBe(1);
  });

  it('a lone "1," (comma variant of mid-typing) parses to 1', () => {
    expect(parseDecimal('1,')).toBe(1);
  });

  it('a finite negative parses (a ruled no-fix depends on this)', () => {
    expect(parseDecimal('-1')).toBe(-1);
  });

  it('scientific notation still parses (Number() semantics, not reimplemented)', () => {
    expect(parseDecimal('1e5')).toBe(100000);
  });

  it('leading/trailing whitespace is trimmed', () => {
    expect(parseDecimal('  45  ')).toBe(45);
  });
});
