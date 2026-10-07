/**
 * Chạy một thao tác cho nhiều mục (tuần tự để không mở hàng chục Chrome cùng lúc),
 * gom lỗi theo tên. Trả câu tóm tắt nếu có lỗi, null nếu tất cả thành công.
 */
export async function runBatch<T>(
  items: T[],
  name: (item: T) => string,
  fn: (item: T) => Promise<unknown>
): Promise<string | null> {
  const errors: string[] = []
  for (const item of items) {
    try {
      await fn(item)
    } catch (e) {
      errors.push(`${name(item)}: ${(e as Error).message}`)
    }
  }
  if (errors.length === 0) return null
  const shown = errors.slice(0, 3).join(' · ')
  return `${items.length - errors.length}/${items.length} thành công. ${shown}${errors.length > 3 ? ` · và ${errors.length - 3} lỗi khác` : ''}`
}
