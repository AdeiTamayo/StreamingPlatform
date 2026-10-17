/**
 * Outcome of a remote write.
 *
 * Repositories never reject: a write that can't reach the server is parked in
 * the offline queue instead. Callers that decide whether local data is safe to
 * delete (data migration, backup import) must check `queued` - a queued write
 * has not been persisted yet and may still be dropped.
 */
export interface WriteOutcome {
  /** True when the write did not reach the server and was queued for later sync. */
  queued: boolean;
}
