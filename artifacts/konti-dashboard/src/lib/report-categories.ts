// Re-export the shared report-category model so existing
// `@/lib/report-categories` imports keep working. The single source of truth
// lives in lib/report-categories so the api-server rollup and the dashboard
// renderer can never drift out of sync.
export {
  bucketForTradeCategory,
  REPORT_BUCKET_KEYS,
  REPORT_BUCKET_LABELS,
  reportBucketLabel,
  rollupByBucket,
  rollupRecordByBucket,
  tradeCategoryLabel,
} from "@workspace/report-categories";
export type { BucketRollupRow, ReportBucketKey } from "@workspace/report-categories";

// Backwards-compatible alias — older call sites still import this name and
// expect a friendly trade-level label (Foundation, Steel, …) for raw line
// items in the Material Cost Summary.
export { tradeCategoryLabel as reportCategoryLabel } from "@workspace/report-categories";
