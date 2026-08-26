import { describe, test, expect } from 'vitest';
import { toE164, formatUsPhone } from './phone';

/* These two feed Clerk directly: a wrong E.164 here is a failed SMS with no error the user can act
   on, which is why the "user typed the 1 themselves" tolerance is worth pinning. */

describe('toE164', () => {
  test('ten digits become +1 E.164', () => {
    expect(toE164('5125550134')).toBe('+15125550134');
  });

  test('formatting characters are stripped', () => {
    expect(toE164('(512) 555-0134')).toBe('+15125550134');
  });

  test('a user-typed leading 1 is not doubled', () => {
    expect(toE164('15125550134')).toBe('+15125550134');
    expect(toE164('+1 512 555 0134')).toBe('+15125550134');
  });

  test('a leading 1 on a 10-digit number is a real area-code digit, not a country code', () => {
    // 11-digit-with-1 is the only stripped shape; "1235550134" is someone's actual number.
    expect(toE164('1235550134')).toBe('+11235550134');
  });
});

describe('formatUsPhone', () => {
  test('full number gets the (xxx) xxx-xxxx display form', () => {
    expect(formatUsPhone('5125550134')).toBe('+1 (512) 555-0134');
    expect(formatUsPhone('1-512-555-0134')).toBe('+1 (512) 555-0134');
  });

  test('partial input is shown bare rather than mangled into a wrong-looking number', () => {
    expect(formatUsPhone('51255')).toBe('+1 51255');
  });
});
