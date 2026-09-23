"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

/**
 * Sharing a product.
 *
 * The link is built on the server, because the bot's username is server env.
 *
 * Three ways down, in order of how well they work where this runs. Telegram's
 * own share sheet is reached by opening `t.me/share`, which inside a Mini App
 * the client intercepts; a plain browser gets the OS share sheet where there is
 * one; and the last resort is the clipboard, with the label saying so, because
 * a button that silently does nothing is worse than one that does less.
 */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelled, or refused by the embedder. Fall through.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      return;
    } catch {
      // Clipboard denied: open Telegram's own sheet instead.
    }

    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Button variant="quiet" onClick={() => void share()}>
      {copied ? "Ссылка скопирована" : "Поделиться"}
    </Button>
  );
}
