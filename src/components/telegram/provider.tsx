"use client";

import {
  backButton,
  hapticFeedback,
  init,
  initData,
  isTMA,
  mainButton,
  miniApp,
  requestContact,
  retrieveRawInitData,
  swipeBehavior,
  themeParams,
  viewport,
} from "@tma.js/sdk-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { CANVAS } from "@/lib/tokens";

/**
 * Telegram integration.
 *
 * The same pages render inside Telegram and as an ordinary website, so every
 * Telegram-only call has to degrade to a silent no-op — not a caught error, not
 * a console warning. `.ifAvailable()` already folds in "is Telegram + SDK
 * initialised + isSupported + isMounted", which is exactly that.
 *
 * Everything runs in an effect. `isTMA()` dereferences bare `window`, so it
 * cannot be hoisted to module scope or a server component, and `init()` throws
 * outside Telegram — hence the guard and the try/catch around the whole body.
 *
 * `ready` is why this is a provider rather than a set of loose hooks. Screens
 * configure MainButton and BackButton, and a screen's effect can run before
 * this one has finished mounting the SDK. With no flag to wait on, whether the
 * button appears depends on effect ordering — which fails intermittently, the
 * worst way to fail.
 */

export interface TelegramState {
  /** The SDK has finished mounting. Until then, no component touches a button. */
  ready: boolean;
  /** False in a plain browser. Screens use it to render their own affordances. */
  isTelegram: boolean;
  /**
   * The signed launch string, for server-side signature verification.
   * Never logged: it carries the user's name and id.
   */
  rawInitData: string | undefined;
}

const TelegramContext = createContext<TelegramState>({
  ready: false,
  isTelegram: false,
  rawInitData: undefined,
});

export function useTelegram(): TelegramState {
  return useContext(TelegramContext);
}

/**
 * The SDK lives in a module-level store rather than component state.
 *
 * Two reasons. Booting is an external side effect on `window`, and
 * useSyncExternalStore is the API built for reading one across SSR — it takes a
 * server snapshot instead of producing a render cascade from an effect. And the
 * store boots exactly once however many times the provider mounts, which
 * matters because React 19 StrictMode double-invokes effects in development
 * and a second init() would re-register listeners on the same
 * window.TelegramWebviewProxy.
 */
const SERVER_STATE: TelegramState = {
  ready: false,
  isTelegram: false,
  rawInitData: undefined,
};

let current: TelegramState = SERVER_STATE;
let booted = false;
let teardown: (() => void) | undefined;
const listeners = new Set<() => void>();

function publish(next: TelegramState) {
  current = next;
  for (const l of listeners) l();
}

function boot() {
  let destroy: (() => void) | undefined;

  try {
    // Sync overload, returns a boolean. Must not run on the server.
    if (!isTMA()) {
      // A plain browser: ready, so screens stop waiting and render their own
      // back and submit controls instead.
      publish({ ready: true, isTelegram: false, rawInitData: undefined });
      return;
    }

    destroy = init();

    let raw: string | undefined;
    try {
      raw = retrieveRawInitData();
      initData.restore();
    } catch {
      // Launched without init data — unusual but survivable.
    }

    // Synchronous mounts. There is no mountSync in this SDK; that belonged to
    // the @telegram-apps packages this replaced.
    miniApp.mount.ifAvailable();
    themeParams.mount.ifAvailable();
    backButton.mount.ifAvailable();
    mainButton.mount.ifAvailable();

    // A second bindCssVars throws CSSVarsBoundError.
    if (!miniApp.isCssVarsBound()) miniApp.bindCssVars.ifAvailable();
    if (!themeParams.isCssVarsBound()) themeParams.bindCssVars.ifAvailable();

    // The catalog does not inherit Telegram's theme: it is a cream surface in
    // both. Hex is only accepted on newer clients, so it is feature-detected.
    if (miniApp.setHeaderColor.isAvailable()) {
      if (miniApp.setHeaderColor.supports("rgb")) {
        miniApp.setHeaderColor(CANVAS);
      } else {
        miniApp.setHeaderColor("bg_color");
      }
    }
    miniApp.setBgColor.ifAvailable(CANVAS);
    miniApp.setBottomBarColor.ifAvailable(CANVAS);

    // viewport.mount returns a promise, unlike the buttons. Binding the insets
    // before it resolves reads them all as zero.
    const mounted = viewport.mount.ifAvailable();
    if (mounted.ok) {
      void mounted.data.then(
        () => {
          if (!viewport.isCssVarsBound()) viewport.bindCssVars.ifAvailable();
        },
        () => undefined,
      );
    }

    miniApp.ready.ifAvailable();
    publish({ ready: true, isTelegram: true, rawInitData: raw });
  } catch {
    // Anything unexpected still leaves a usable website.
    publish({ ready: true, isTelegram: false, rawInitData: undefined });
  }

  teardown = () => {
    // viewport has no unmount, unlike the rest.
    mainButton.unmount();
    backButton.unmount();
    themeParams.unmount();
    miniApp.unmount();
    destroy?.();
  };
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!booted) {
    booted = true;
    boot();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      teardown?.();
      teardown = undefined;
      booted = false;
      current = SERVER_STATE;
    }
  };
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    subscribe,
    () => current,
    () => SERVER_STATE,
  );

  return <TelegramContext.Provider value={state}>{children}</TelegramContext.Provider>;
}

// ── Screen-level helpers ─────────────────────────────────────────────────────

/**
 * Drives Telegram's MainButton.
 *
 * Every hook here waits on `ready`; the effects re-run when it flips, so
 * nothing is lost by being early. Outside Telegram they do nothing at all and
 * the screen renders its own button.
 */
export function useMainButton(options: {
  text: string;
  visible: boolean;
  enabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const { ready, isTelegram } = useTelegram();
  const { text, visible, enabled = true, loading = false, onClick } = options;

  useEffect(() => {
    if (!ready || !isTelegram) return;
    mainButton.setParams.ifAvailable({
      text,
      isVisible: visible,
      isEnabled: enabled && !loading,
      isLoaderVisible: loading,
    });
  }, [ready, isTelegram, text, visible, enabled, loading]);

  useEffect(() => {
    if (!ready || !isTelegram) return;
    const bound = mainButton.onClick.ifAvailable(onClick);
    return bound.ok ? bound.data : undefined;
  }, [ready, isTelegram, onClick]);

  // Leaving a screen must not leave its button behind on the next one.
  useEffect(() => {
    if (!ready || !isTelegram) return;
    return () => {
      mainButton.setParams.ifAvailable({ isVisible: false, isLoaderVisible: false });
    };
  }, [ready, isTelegram]);
}

export function useBackButton(onBack: (() => void) | null) {
  const { ready, isTelegram } = useTelegram();

  useEffect(() => {
    if (!ready || !isTelegram) return;
    if (!onBack) {
      backButton.hide.ifAvailable();
      return;
    }
    backButton.show.ifAvailable();
    const bound = backButton.onClick.ifAvailable(onBack);
    return () => {
      if (bound.ok) bound.data();
      backButton.hide.ifAvailable();
    };
  }, [ready, isTelegram, onBack]);
}

/**
 * Telegram closes the Mini App on a downward swipe, which fights a bottom
 * sheet. Disabled while one is open and restored when it closes.
 */
export function useDisableSwipeToClose(active: boolean) {
  const { ready, isTelegram } = useTelegram();

  useEffect(() => {
    if (!ready || !isTelegram || !active) return;
    swipeBehavior.mount.ifAvailable();
    swipeBehavior.disableVertical.ifAvailable();
    return () => {
      swipeBehavior.enableVertical.ifAvailable();
    };
  }, [ready, isTelegram, active]);
}

export function useHaptics() {
  const { ready, isTelegram } = useTelegram();
  const enabled = ready && isTelegram;

  return useMemo(
    () => ({
      /** A basket addition, a stepper tap. */
      tap: () => {
        if (enabled) hapticFeedback.impactOccurred.ifAvailable("light");
      },
      /** A request that went through. */
      success: () => {
        if (enabled) hapticFeedback.notificationOccurred.ifAvailable("success");
      },
      error: () => {
        if (enabled) hapticFeedback.notificationOccurred.ifAvailable("error");
      },
    }),
    [enabled],
  );
}

/**
 * Asks Telegram for the buyer's phone number.
 *
 * Returns undefined when declined or unavailable, so the caller falls back to
 * the typed field rather than treating it as an error.
 */
export function useRequestPhone() {
  const { ready, isTelegram } = useTelegram();

  return useCallback(async (): Promise<string | undefined> => {
    if (!ready || !isTelegram || !requestContact.isAvailable()) return undefined;
    try {
      const contact = await requestContact({ timeout: 15_000 });
      return contact.contact.phone_number;
    } catch {
      return undefined;
    }
  }, [ready, isTelegram]);
}
