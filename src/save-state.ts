export type SaveStatus = "saving" | "saved" | "error";

export function createSaveTracker() {
  let revision = 0;
  let status: SaveStatus = "saved";
  return {
    begin() {
      status = "saving";
      return ++revision;
    },
    resolve(completed: number): SaveStatus {
      if (completed === revision) status = "saved";
      return status;
    },
    reject(failed: number): SaveStatus {
      if (failed === revision) status = "error";
      return status;
    },
    status: () => status,
  };
}
