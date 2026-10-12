export type BlockFlats = { name: string; flats: { id: string; label: string }[] };

/** A flat picker grouped by block. */
export default function FlatSelect({ id, blocks, defaultValue = "", required = true }: {
  id: string; blocks: BlockFlats[]; defaultValue?: string; required?: boolean;
}) {
  return (
    <select id={id} name="unit_id" className="input" defaultValue={defaultValue} required={required}>
      <option value="">Choose a flat</option>
      {blocks.map((b) => (
        <optgroup key={b.name} label={b.name}>
          {b.flats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
