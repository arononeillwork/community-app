import "server-only";

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Read every row of a query in pages of 1,000 (the API's row limit), so totals are never cut short. */
export async function fetchAll<T>(query: (from: number, to: number) => Page<T>, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}
