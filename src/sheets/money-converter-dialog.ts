const { DialogV2 } = foundry.applications.api as unknown as {
  DialogV2: any;
};

class MoneyConverterDialog extends DialogV2 {
  rates: Record<string, number>;

  constructor(options: any, rates: Record<string, number>) {
    super(options);
    this.rates = rates;
  }

  protected override _onRender(context: any, options: any) {
    super._onRender(context, options);
    const html = this.element;

    const leftInput = html.querySelector('#hbm-conv-left') as HTMLInputElement;
    const rightInput = html.querySelector('#hbm-conv-right') as HTMLInputElement;
    const leftSelect = html.querySelector('#hbm-sf') as HTMLSelectElement;
    const rightSelect = html.querySelector('#hbm-st') as HTMLSelectElement;

    if (!leftInput || !rightInput || !leftSelect || !rightSelect) return;

    const calcRight = () => {
      const v = parseFloat(leftInput.value);
      if (Number.isNaN(v)) {
        rightInput.value = '';
        return;
      }
      const lk = leftSelect.value;
      const rk = rightSelect.value;
      const res = v * this.rates[lk] / this.rates[rk];
      rightInput.value = isFinite(res) ? res.toFixed(4) : '';
    };

    const calcLeft = () => {
      const v = parseFloat(rightInput.value);
      if (Number.isNaN(v)) {
        leftInput.value = '';
        return;
      }
      const lk = leftSelect.value;
      const rk = rightSelect.value;
      const res = v * this.rates[rk] / this.rates[lk];
      leftInput.value = isFinite(res) ? res.toFixed(4) : '';
    };

    leftInput.addEventListener('input', calcRight);
    leftSelect.addEventListener('change', calcRight);
    rightInput.addEventListener('input', calcLeft);
    rightSelect.addEventListener('change', calcRight);
  }
}

export async function showMoneyConverter(actor: any): Promise<void> {
  const pln = actor.system.details?.money ?? 0;
  const currentYear = actor.system.details?.currentYear ?? 2026;
  const currentRealYear = new Date().getFullYear();

  const fetchNBP = async (currency: string, year: number): Promise<{ rate: number; date: string } | null> => {
    if (year >= 2002 && year <= currentRealYear) {
      for (let day = 1; day <= 7; day++) {
        const d = `${year}-06-${String(day).padStart(2, '0')}`;
        try {
          const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/${d}/?format=json`);
          if (res.ok) {
            const data = await res.json();
            const r = data?.rates?.[0]?.mid;
            if (typeof r === 'number') return { rate: r, date: d };
          }
        } catch (_) { /* ignore */ }
      }
    }
    try {
      const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/?format=json`);
      if (res.ok) {
        const data = await res.json();
        const r = data?.rates?.[0]?.mid;
        const dt = data?.rates?.[0]?.effectiveDate || '';
        if (typeof r === 'number') return { rate: r, date: dt };
      }
    } catch (_) { /* ignore */ }
    return null;
  };

  const [eurData, usdData] = await Promise.all([fetchNBP('eur', currentYear), fetchNBP('usd', currentYear)]);
  const eurRate = eurData?.rate ?? 4.35;
  const usdRate = usdData?.rate ?? 4.00;
  const rateDate = eurData?.date ?? usdData?.date ?? 'default';
  const isLive = !!(eurData || usdData);

  const CURRENCIES: Record<string, { labelKey: string; toPln: number; noteKey: string; noteParam?: Record<string, any> }> = {
    PLN: { labelKey: 'HBM.moneyConverter.currencies.PLN', toPln: 1, noteKey: '' },
    EUR: { labelKey: 'HBM.moneyConverter.currencies.EUR', toPln: eurRate, noteKey: 'HBM.moneyConverter.notes.nbp', noteParam: { date: rateDate } },
    USD: { labelKey: 'HBM.moneyConverter.currencies.USD', toPln: usdRate, noteKey: 'HBM.moneyConverter.notes.nbp', noteParam: { date: rateDate } },
    TH: { labelKey: 'HBM.moneyConverter.currencies.TH', toPln: eurRate, noteKey: 'HBM.moneyConverter.notes.th' },
    FC: { labelKey: 'HBM.moneyConverter.currencies.FC', toPln: 2.0, noteKey: 'HBM.moneyConverter.notes.fc' },
    ST: { labelKey: 'HBM.moneyConverter.currencies.ST', toPln: 240, noteKey: 'HBM.moneyConverter.notes.st' },
    ZK: { labelKey: 'HBM.moneyConverter.currencies.ZK', toPln: 2880, noteKey: 'HBM.moneyConverter.notes.zk' },
    PL: { labelKey: 'HBM.moneyConverter.currencies.PL', toPln: 34560, noteKey: 'HBM.moneyConverter.notes.pl' },
  };

  const currKeys = Object.keys(CURRENCIES);
  const optHtml = (sel: string) => currKeys.map(k => {
    const label = game.i18n.localize(CURRENCIES[k].labelKey);
    return `<option value="${k}"${k === sel ? ' selected' : ''}>${label}</option>`;
  }).join('');

  const ratesRows = currKeys.map(k => {
    const c = CURRENCIES[k];
    const label = game.i18n.localize(c.labelKey);
    const note = c.noteKey ? game.i18n.format(c.noteKey, c.noteParam || {}) : '';
    const fromPln = k === 'PLN' ? '1.0000' : (1 / c.toPln).toPrecision(4);
    return `<tr>
      <td>${label}</td>
      <td style="text-align:right;font-family:monospace;">${c.toPln === 1 ? '1.0000' : c.toPln.toFixed(4)}</td>
      <td style="text-align:right;font-family:monospace;">${fromPln}</td>
      <td style="color:#777;font-size:0.75rem;">${note}</td>
    </tr>`;
  }).join('');

  const rates = Object.fromEntries(currKeys.map(k => [k, CURRENCIES[k].toPln]));

  const liveText = isLive 
    ? game.i18n.format('HBM.moneyConverter.liveRates', { date: rateDate })
    : game.i18n.localize('HBM.moneyConverter.defaultRates');

  const initialEur = isFinite(pln / eurRate) ? (pln / eurRate).toFixed(4) : '';

  const content = `
    <div class="hbm money-converter" style="padding:10px;font-family:'Signika',sans-serif;display:flex;flex-direction:column;gap:12px;">
      <p style="margin:0;font-size:0.78rem;color:${isLive ? '#2a7a3e' : '#888'};">
        <em>${liveText}</em>
      </p>
      <div style="background:var(--hbm-card-bg,#1a1a2e);border:1px solid var(--hbm-border,#333);border-radius:6px;padding:8px 12px;">
        <span style="font-weight:bold;">${game.i18n.localize('HBM.moneyConverter.actorCash')}</span>
        <span style="font-family:monospace;font-size:1.1rem;margin-left:6px;">${pln} PLN</span>
        <small style="color:#888;margin-left:6px;">(${game.i18n.format('HBM.moneyConverter.campaignYear', { year: currentYear })})</small>
      </div>
      <div style="background:var(--hbm-card-bg,#1a1a2e);border:1px solid var(--hbm-accent,#6060c0);border-radius:6px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
        <strong style="font-size:0.9rem;">${game.i18n.localize('HBM.moneyConverter.calculator')}</strong>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input id="hbm-conv-left" type="number" value="${pln}" min="0" step="any"
            style="width:6.5rem;font-size:1rem;text-align:right;padding:3px 6px;background:transparent;color:var(--hbm-fg,#eee);border:1px solid var(--hbm-border,#555);border-radius:4px;" />
          <select id="hbm-sf" style="flex:1;min-width:8rem;">
            ${optHtml('PLN')}
          </select>
          <span style="font-size:1.2rem;color:var(--hbm-accent,#8080ff);">⇄</span>
          <input id="hbm-conv-right" type="number" value="${initialEur}" min="0" step="any"
            style="width:6.5rem;font-size:1rem;text-align:right;padding:3px 6px;background:transparent;color:var(--hbm-fg,#eee);border:1px solid var(--hbm-border,#555);border-radius:4px;" />
          <select id="hbm-st" style="flex:1;min-width:8rem;">
            ${optHtml('EUR')}
          </select>
        </div>
      </div>
      <details>
        <summary style="cursor:pointer;font-size:0.85rem;color:var(--hbm-accent-dim,#999);">▸ ${game.i18n.localize('HBM.moneyConverter.exchangeRatesTable')}</summary>
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-top:8px;">
          <thead><tr style="border-bottom:1px solid var(--hbm-border,#555);">
            <th style="text-align:left;">${game.i18n.localize('HBM.moneyConverter.currency')}</th>
            <th style="text-align:right;">${game.i18n.localize('HBM.moneyConverter.ratePln')}</th>
            <th style="text-align:right;">${game.i18n.localize('HBM.moneyConverter.onePlnEquals')}</th>
            <th>${game.i18n.localize('HBM.moneyConverter.note')}</th>
          </tr></thead>
          <tbody>${ratesRows}</tbody>
        </table>
      </details>
    </div>
  `;

  const dialog = new MoneyConverterDialog({
    window: { title: game.i18n.localize('HBM.ui.moneyConverterTitle') },
    content,
    buttons: [
      {
        action: 'ok',
        label: game.i18n.localize('HBM.ui.confirm') || 'Ok',
        default: true
      }
    ],
    rejectClose: false
  }, rates);

  dialog.render(true);
}
