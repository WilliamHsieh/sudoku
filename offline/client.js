let currentBuild;
export function command(type, extra = {}, onPreparing = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = navigator.serviceWorker.controller;
    if (!worker) return reject(new Error("Offline support is not ready"));
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("Preparing puzzles timed out. Please retry."));
    }, 125_000);
    channel.port1.onmessage = ({ data }) => {
      if (data.state === "preparing") {
        onPreparing();
        return;
      }
      clearTimeout(timer);
      channel.port1.close();
      if (data.error) reject(new Error(data.error));
      else resolve(data.value);
    };
    worker.postMessage({ type, ...extra }, [channel.port2]);
  });
}
export async function prepareOffline(current, base, onPreparing) {
  currentBuild = current;
  if (!navigator.serviceWorker || !globalThis.isSecureContext)
    throw new Error("Offline puzzles need a browser with service worker support.");
  const register = async () => {
    await navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) => {
        const changed = () => {
          if (!navigator.serviceWorker.controller) return;
          navigator.serviceWorker.removeEventListener("controllerchange", changed);
          resolve();
        };
        navigator.serviceWorker.addEventListener("controllerchange", changed);
        changed();
      });
  };
  // An existing controller can verify the local release immediately. Browser
  // registration/update checks must not put the network on the warm boot path.
  if (navigator.serviceWorker.controller) {
    void register().catch(() => {});
    return command("PREPARE", { current, notifyPreparing: true }, onPreparing);
  }
  let timer;
  try {
    await Promise.race([
      register(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Offline support timed out. Please retry.")),
          15_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  return command("PREPARE", { current, notifyPreparing: true }, onPreparing);
}
export function stageUpdate(current) {
  return command("STAGE", { current });
}
export async function activateUpdate(version) {
  if (!currentBuild) throw new Error("Offline support is not ready");
  await command("ACTIVATE", { version });
}
