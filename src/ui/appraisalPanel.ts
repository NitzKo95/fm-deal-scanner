import { APPRAISAL_MODES, appraise, type AppraisalResult } from '../appraisal/appraise';
import { addEntry, clampQty, entryFor, parseAppraisalLines } from '../appraisal/entries';
import { quoteFull, quoteShort } from '../appraisal/quote';
import type { Engine } from '../engine';
import { parseAmount } from '../lib/text';
import { DEFAULT_SETTINGS, type AppraisalData, type AppraisalMode } from '../lib/types';
import type { Storage } from '../store/storage';
import { appraisalRowsHtml, appraisalText } from './appraisalViews';
import { $ } from './dom';

export interface PanelDeps { engine: Engine; store: Storage; failed: ReadonlySet<string> }

const CLEAR_LABEL = 'Clear';

/** The appraisal panel: the list you build by hand (or, later, by hovering), what it is worth, and the quote. */
export class AppraisalPanel {
  private data: AppraisalData;
  private clearArmed = 0;

  constructor(private readonly d: PanelDeps) {
    this.data = d.store.loadAppraisal();
    // settings saved by hand or by another version can hold anything: fall back to the defaults
    const s = d.engine.settings;
    if (!(s.appraisalMode in APPRAISAL_MODES)) s.appraisalMode = DEFAULT_SETTINGS.appraisalMode;
    if (!(s.bulkOffer > 0)) s.bulkOffer = DEFAULT_SETTINGS.bulkOffer;
  }

  private get settings() { return this.d.engine.settings; }

  result(): AppraisalResult {
    return appraise(this.d.engine, this.data.entries, this.settings.appraisalMode, this.settings.bulkOffer);
  }

  private save(): void { this.d.store.saveAppraisal(this.data); }
  private find(id: string | undefined) { return this.data.entries.find((x) => x.id === id); }

  wire(): void {
    const mode = $<HTMLSelectElement>('apMode'), bulk = $<HTMLInputElement>('apBulk');
    mode.value = this.settings.appraisalMode;
    bulk.value = String(this.settings.bulkOffer);
    mode.addEventListener('change', () => {
      this.settings.appraisalMode = mode.value as AppraisalMode;
      this.d.store.saveSettings(this.settings);
      this.render();
    });
    bulk.addEventListener('change', () => {
      const v = parseFloat(bulk.value);
      if (Number.isFinite(v) && v > 0) this.settings.bulkOffer = Math.min(300, Math.round(v * 10) / 10);
      bulk.value = String(this.settings.bulkOffer);
      this.d.store.saveSettings(this.settings);
      this.render();
    });

    const table = $('apTable');
    table.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (!t.classList.contains('cellinput')) return;
      const entry = this.find(t.dataset.id);
      if (!entry) return;
      if (t.dataset.field === 'qty') entry.qty = clampQty(parseInt(t.value.replace(/,/g, ''), 10));
      else if (t.value.trim() === '') delete entry.price;
      else { const v = parseAmount(t.value); if (v) entry.price = v; }
      this.save(); t.blur(); this.render();
    });
    table.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]');
      const entry = b && this.find(b.dataset.id);
      if (!b || !entry) return;
      if (b.dataset.act === 'skip') entry.ignored = !entry.ignored || undefined;
      else this.data.entries = this.data.entries.filter((x) => x !== entry);
      this.save(); this.render();
    });

    $('apAddBtn').addEventListener('click', () => {
      const box = $<HTMLTextAreaElement>('apAdd');
      const { ok, bad } = parseAppraisalLines(box.value);
      for (const { name, qty } of ok) addEntry(this.data.entries, entryFor(this.d.engine, name, qty));
      this.save(); this.render();
      $('apMsg').textContent = ok.length || bad.length
        ? `Added ${ok.length} item${ok.length === 1 ? '' : 's'}.` + (bad.length ? ` Couldn't read ${bad.length} line${bad.length === 1 ? '' : 's'}: ${bad.slice(0, 2).join(' / ')}` : '')
        : 'Type or paste item names first.';
      if (!bad.length) box.value = '';
    });

    $('apCopy').addEventListener('click', () => void this.copy(quoteShort(this.result())));
    $('apCopyFull').addEventListener('click', () => void this.copy(quoteFull(this.result())));
    const clear = $('apClear');
    clear.addEventListener('click', () => {
      if (!this.data.entries.length) return;
      if (Date.now() - this.clearArmed > 4000) {
        this.clearArmed = Date.now();
        clear.textContent = 'Click again to clear';
        setTimeout(() => { clear.textContent = CLEAR_LABEL; }, 4000);
        return;
      }
      this.data.entries = [];
      this.clearArmed = 0; clear.textContent = CLEAR_LABEL;
      this.save(); this.render();
      $('apMsg').textContent = 'Cleared.';
    });
  }

  /** The clipboard, where the browser allows it; the quote line stays on screen to copy by hand. */
  private async copy(text: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); $('apMsg').textContent = 'Copied.'; }
    catch { $('apMsg').textContent = "Couldn't copy. Select the quote text and copy it."; }
  }

  render(): void {
    // typing in a box: leave the table alone until the change is made
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.closest('#apTable')) return;
    const r = this.result(), t = appraisalText(r);
    $('apMeta').textContent = t.meta;
    $('apBody').innerHTML = appraisalRowsHtml(r, this.d.engine.market, this.d.failed);
    $('apEmpty').hidden = r.lines.length > 0;
    $('apTable').hidden = !r.lines.length;
    $('apTotal').textContent = t.total;
    $('apRough').textContent = t.rough;
    $('apWarn').textContent = t.warn;
    $('apWarn').hidden = !t.warn;
    $('apOfferLabel').textContent = t.offerLabel;
    $('apOffer').textContent = t.offer;
    $('apModeNote').textContent = t.mode;
    $('apQuote').textContent = quoteShort(r);
    for (const id of ['apCopy', 'apCopyFull']) $<HTMLButtonElement>(id).disabled = !r.kinds;
    $<HTMLButtonElement>('apClear').disabled = !this.data.entries.length;
  }
}
