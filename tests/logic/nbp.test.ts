import { describe, it, expect, vi } from 'vitest';
import { fetchNbpRate } from '../../src/logic/nbp';

const ok = (mid: number, effectiveDate: string) => ({ ok: true, json: async () => ({ rates: [{ mid, effectiveDate }] }) });
const notFound = { ok: false, json: async () => ({}) };
const now = new Date('2026-10-20');

describe('fetchNbpRate', () => {
  it('uses the June window for a past year', async () => {
    const f = vi.fn().mockResolvedValue(ok(4.4, '2024-06-03'));
    expect(await fetchNbpRate('EUR', 2024, now, f)).toEqual({ rate: 4.4, date: '2024-06-03' });
    expect(f.mock.calls[0]![0]).toContain('/eur/2024-06-01/2024-06-14/');
  });

  it('uses the latest rate for a future year without a dated request', async () => {
    const f = vi.fn().mockResolvedValue(ok(4.3, '2026-10-19'));
    expect(await fetchNbpRate('eur', 2031, now, f)).toEqual({ rate: 4.3, date: '2026-10-19' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).not.toMatch(/\d{4}-\d{2}-\d{2}\//);
  });

  it('falls back to the latest rate when the dated window has no table', async () => {
    const f = vi.fn().mockResolvedValueOnce(notFound).mockResolvedValueOnce(ok(4.2, '2026-10-19'));
    expect((await fetchNbpRate('eur', 2026, now, f))?.rate).toBe(4.2);
  });

  it('returns null when NBP is unreachable', async () => {
    const f = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await fetchNbpRate('eur', 2024, now, f)).toBeNull();
  });
});
