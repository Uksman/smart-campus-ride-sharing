"use client";

import { useEffect, useState } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type BeforeInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const DISMISSED_UNTIL_KEY = "campusride-install-dismissed-until";

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPrompt | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // The app remains usable when service worker registration is unavailable.
      });
    }

    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setInstalled(standalone);
    setIsIos(ios);

    try {
      const dismissedUntil = Number(window.localStorage.getItem(DISMISSED_UNTIL_KEY) || 0);
      setDismissed(dismissedUntil > Date.now());
    } catch {
      // Installation remains available when browser storage is disabled.
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPrompt);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setHelpOpen(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [helpOpen]);

  async function installOrExplain() {
    if (!installPrompt) {
      setHelpOpen(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") setInstalled(true);
      else setHelpOpen(true);
    } catch {
      setInstallPrompt(null);
      setHelpOpen(true);
    }
  }

  function dismissInstallMessage() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {
      // The message is still dismissed for this page session.
    }
  }

  return <>
    {!installed && !dismissed && <aside className="pwa-install-banner" aria-label="Install CampusRide">
      <div className="pwa-install-copy">
        <strong>Install CampusRide</strong>
        <span>Keep your campus rides one tap away.</span>
      </div>
      <button className="pwa-install-action" type="button" onClick={() => void installOrExplain()}>
        {installPrompt ? "Install" : "How to"}
      </button>
      <button className="pwa-install-dismiss" type="button" onClick={dismissInstallMessage} aria-label="Dismiss install message">×</button>
    </aside>}

    {helpOpen && <div className="pwa-install-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setHelpOpen(false);
    }}>
      <section className="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
        <button className="pwa-install-dialog-close" type="button" onClick={() => setHelpOpen(false)} aria-label="Close install instructions">×</button>
        <p className="pwa-install-kicker">CAMPUSRIDE ON YOUR PHONE</p>
        <h2 id="pwa-install-title">{isIos ? "Add CampusRide to your Home Screen" : "Install CampusRide"}</h2>
        {isIos ? <ol className="pwa-install-steps">
          <li>Open this page in Safari and tap the Share button.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong> to finish.</li>
        </ol> : <ol className="pwa-install-steps">
          <li>Open this page in your browser’s menu (⋮ or Share).</li>
          <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li>If that option is missing, open the site over HTTPS in Chrome and reload.</li>
        </ol>}
        <button className="pwa-install-done" type="button" onClick={() => setHelpOpen(false)}>Got it</button>
      </section>
    </div>}
  </>;
}
