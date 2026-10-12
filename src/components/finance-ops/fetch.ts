import "server-only";

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Read every row of a query in pages of 1,000 (the API returns at most 1,000 rows per request).
 * Fee charges grow by flats x periods every year, so summing a single request would silently
 * undercount after a few years. Pass a query that has a stable order.
 */
export async function fetchAllRows<T>(query: (from: number, to: number) => Page<T>, pageSize = 1000): Promise<{ rows: T[]; error: boolean }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error || !data) return { rows, error: true };
    rows.push(...data);
    if (data.length < pageSize) return { rows, error: false };
  }
}
