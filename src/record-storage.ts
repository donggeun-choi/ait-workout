type Port = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
export function createRecordStorage(
  key: string,
  native: Port | null,
  web: Pick<Storage, "getItem" | "setItem">,
) {
  let queue: Promise<void> = Promise.resolve();
  return {
    async read() {
      if (!native) return { raw: web.getItem(key), migrate: false };
      const raw = await native.getItem(key);
      if (raw !== null) return { raw, migrate: false };
      return { raw: web.getItem(key), migrate: true };
    },
    write(raw: string) {
      const next = queue
        .catch(() => {})
        .then(async () => {
          if (native) await native.setItem(key, raw);
          else web.setItem(key, raw);
        });
      queue = next;
      return next;
    },
  };
}
