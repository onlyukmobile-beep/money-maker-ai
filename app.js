// Register the PWA shell independently from the React bundle.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // The studio stays usable if the host does not allow service workers.
    });
  });
}