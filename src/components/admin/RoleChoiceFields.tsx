"use client";

import { useState } from "react";
import { ROLES, ROLE_LABELS, needsFlat, type AdminRole } from "./labels";

/** "Change to which role?" (+ "which flat?" for owners and tenants), used inside a ConfirmAction form. */
export default function RoleChoiceFields({ current, units, idPrefix }: {
  current: AdminRole;
  units: { id: string; label: string }[];
  idPrefix: string;
}) {
  const [role, setRole] = useState<AdminRole | "">("");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="field">
        <label htmlFor={`${idPrefix}-new-role`}>Change to</label>
        <select id={`${idPrefix}-new-role`} name="new_role" required className="input" value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}>
          <option value="" disabled>Choose the new role</option>
          {ROLES.filter((r) => r !== current).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>
      {role && needsFlat(role) && (
        <div className="field">
          <label htmlFor={`${idPrefix}-unit`}>Which flat?</label>
          <select id={`${idPrefix}-unit`} name="unit_id" required className="input" defaultValue="">
            <option value="" disabled>Choose a flat</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
