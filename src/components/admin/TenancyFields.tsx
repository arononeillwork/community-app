import { TENANCY_TYPES } from "./format";

/** Tenancy type, dates and an optional note. Used when inviting a tenant or linking one to a flat. */
export default function TenancyFields({ idPrefix, today }: { idPrefix: string; today: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="field sm:col-span-2">
        <label htmlFor={`${idPrefix}-type`}>Type of tenancy</label>
        <select id={`${idPrefix}-type`} name="tenancy_type" className="input" defaultValue="long_term">
          {TENANCY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-start`}>Moves in</label>
        <input id={`${idPrefix}-start`} name="start_date" type="date" className="input" defaultValue={today} required />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-end`}>Moves out <span className="font-normal text-muted">· optional</span></label>
        <input id={`${idPrefix}-end`} name="end_date" type="date" className="input" min={today} />
        <p className="hint">Their access ends automatically on this day.</p>
      </div>
      <div className="field sm:col-span-2">
        <label htmlFor={`${idPrefix}-note`}>Note <span className="font-normal text-muted">· optional</span></label>
        <input id={`${idPrefix}-note`} name="note" className="input" maxLength={500} placeholder="e.g. Winter let, landlord's daughter" />
      </div>
    </div>
  );
}
