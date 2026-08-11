import { describe, it, expect } from 'vitest';
import { ToolQuotaLedger } from '../src/security/quota-ledger.js';

const T0 = 1_000_000;

describe('ToolQuotaLedger', () => {
  it('tracks each tool independently within a session', () => {
    const ledger = new ToolQuotaLedger({ exec: { perMinute: 1, perSession: 10 } });
    const guard = ledger.forSession('s1');

    guard.record('exec', T0);

    expect(guard.check('exec', T0)).toMatchObject({ kind: 'exceeded', scope: 'minute' });
    expect(guard.check('read', T0)).toEqual({ kind: 'within' });
  });

  it('keeps sessions isolated so a new session starts with a full allowance', () => {
    const ledger = new ToolQuotaLedger({ exec: { perMinute: 1, perSession: 10 } });
    ledger.forSession('s1').record('exec', T0);

    expect(ledger.forSession('s2').check('exec', T0)).toEqual({ kind: 'within' });
  });

  it('restores the full allowance after a reset', () => {
    const ledger = new ToolQuotaLedger({ exec: { perMinute: 1, perSession: 10 } });
    const guard = ledger.forSession('s1');
    guard.record('exec', T0);
    ledger.reset('s1');

    expect(ledger.forSession('s1').check('exec', T0)).toEqual({ kind: 'within' });
  });
});
