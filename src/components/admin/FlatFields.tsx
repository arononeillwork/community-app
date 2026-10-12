/** Floor, bedrooms and participation share. Used when adding or editing a flat. */
export default function FlatFields({ idPrefix, floor, bedrooms, coefficient, shareHint }: {
  idPrefix: string; floor?: number | null; bedrooms?: number | null; coefficient?: number | null; shareHint?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <div className="field">
        <label htmlFor={`${idPrefix}-floor`}>Floor</label>
        <input id={`${idPrefix}-floor`} name="floor" type="number" inputMode="numeric" min={-5} max={99} step={1} className="input"
          defaultValue={floor ?? ""} />
        <p className="hint">0 = ground</p>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-bedrooms`}>Bedrooms</label>
        <input id={`${idPrefix}-bedrooms`} name="bedrooms" type="number" inputMode="numeric" min={0} max={20} step={1} className="input"
          defaultValue={bedrooms ?? ""} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-share`}>Share (%)</label>
        <input id={`${idPrefix}-share`} name="coefficient" inputMode="decimal" className="input tabular" required
          pattern="[0-9]+([.,][0-9]{1,4})?" title="A percentage with up to four decimals, for example 2.5253"
          defaultValue={coefficient != null ? String(Number(coefficient)) : ""} placeholder="2.5253" />
      </div>
      {shareHint && <p className="hint col-span-3">{shareHint}</p>}
    </div>
  );
}
