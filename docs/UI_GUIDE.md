# UI guide

How pages in this app look and are built. Read this before adding or changing a screen.
Reference implementations: `src/app/[community]/(app)/home/page.tsx`, `report/[id]/page.tsx`, `report/new/ReportForm.tsx`.

## Principles
- **Calm and light.** White cards on a pale grey page, thin borders, soft shadows, generous spacing. No heavy boxes inside boxes.
- **Regular-weight text.** Body text is regular (400). Use `font-medium` (500) for names, links and labels, `font-semibold` (600) only for page/section titles and key numbers. **Never use `font-bold`.**
- **Few words.** One-sentence intros at most. Let layout, icons and numbers carry meaning. Sentence case everywhere; no ALL CAPS except the tiny sidebar group labels.
- **One main action per screen**, as a primary `Button` (top right in `PageHeader`, or at the bottom of a form).
- **Accessible for older residents.** Base text is 17px and scales with the user's text-size setting (use `rem`/Tailwind sizes, never `px` for text). Tap targets ≥ 40px. Every input has a visible `<label>`. Status is colour **and** word (`StatusBadge`). Icon-only buttons are fine for repeated compact actions (call/email/edit) but always via `IconButton`/`ContactActions`, which set `aria-label` and a tooltip.
- **Phones first.** Every page must work at 390px wide with no horizontal scroll. Grids collapse to one column; tables use `DataTable` (which turns rows into cards on phones).

## Tokens (Tailwind classes)
| Purpose | Classes |
|---|---|
| Page / card / subtle fill | `bg-bg`, `bg-surface`, `bg-surface-2` |
| Text | `text-ink` (main), `text-ink-2` (body in lists), `text-muted` (secondary) |
| Borders | `border-line` (dividers, cards), `border-line-strong` (inputs) |
| Brand (white-label) | `bg-brand text-brand-ink` (solid), `bg-brand-soft text-brand-text` (soft), `border-brand-line` |
| Status | `text-ok/warn/bad/info` with `bg-ok-soft/warn-soft/bad-soft/info-soft` |
| Radius / shadow | `rounded-card` (cards), `rounded-xl` (inner tiles), `rounded-[10px]` (controls); `shadow-card`, `shadow-pop` (menus) |

Type scale: page title comes from `PageHeader`; section titles `text-[1.0625rem] font-semibold`; secondary text `text-[0.9375rem]`; meta `text-sm text-muted`; big numbers `text-[1.75rem] font-semibold tabular`.
Dark mode and high contrast work automatically if you only use these tokens. Do not hard-code hex colours except data colours (bin colours, chart series).

## Components (`@/components/ui`, `@/components/contact`, `@/components/DataTable`)
- `PageHeader({ title, intro?, actions?, back?, eyebrow? })`: top of every page.
- `Card({ padded?, className })`: a section. For lists use `padded={false}` and rows `px-5 py-3 sm:px-6` inside `ul.divide-y.divide-line`.
- `SectionHeader({ title, description?, icon?, action? })`: title row inside a card.
- `Button({ variant: primary|secondary|soft|ghost|danger, size: sm|md|lg, href? })`, `buttonClass()` for `<button>`s in client forms, `IconButton({ icon, label, href? })`.
- `Badge`, `StatusBadge`, `Stat`, `Empty({ title, icon?, action? })`, `Notice({ tone, title? })`, `Avatar({ name })`, `DefinitionList({ items })`, `TabLinks({ tabs, label })`.
- `ContactActions({ name, phone, whatsapp, email, variant: icons|buttons })`, `PhoneText`, `telHref`, `whatsappHref`.
- `DataTable({ rows, columns, views?, dateKey?, ... })`: every tabular list (sort, filter, search, export, phone cards). Column `href: "/slug/x/{id}"` makes links.
- Icons: `lucide-react`, `size-4`/`size-5`, `aria-hidden`.

## Page anatomy
```tsx
export const metadata = { title: "Meetings" };
export default async function Page({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireMember(community);          // or requireAdmin / requireFinance
  const supabase = await createClient();             // acts as the signed-in user (RLS applies)
  const { data } = await supabase.from("meetings").select("…").eq("community_id", s.community.id);
  return (
    <>
      <PageHeader title="Meetings" intro="One short sentence." actions={<Button href="…">New meeting</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">…</div>
    </>
  );
}
```
- The app shell (sidebar, top bar) comes from `(app)/layout.tsx`; pages render only their content. Max width is handled by the shell; narrow forms/detail pages use `mx-auto max-w-2xl` / `max-w-3xl`.
- Forms: server actions in a sibling `actions.ts` (`"use server"`), validated on the server, re-checking the role (`requireAdmin`, etc.). Use `useActionState` for errors and redirect with `?saved=1` to show a `Notice`. Always scope writes by `community_id` from the session, never from the form.
- Data: always filter by `s.community.id`. RLS is the real guard; UI checks only hide what the user cannot do. The service-role client (`@/lib/supabase/admin`) is only for admin-only actions that RLS cannot express (e.g. inviting a user), and only after `requireAdmin`.
- Formatting: `money(cents)`, `date()`, `dateTime(d, s.community.timezone)`, `humanize()` from `@/lib/format`.
- Empty states say what to do next (`Empty` with an action).

## Copy
Plain English, short, friendly, no exclamation marks. Name things the way residents do ("flat", "block", "bins", "the office"). Buttons say exactly what happens ("Save contact", "Send update").
