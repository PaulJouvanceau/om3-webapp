import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton } from "./Button";
import { CheckIcon, CopyIcon } from "../icons";

/** How long the check says the text was copied. */
const COPIED_MS = 2000;

/** Whether the page may write the clipboard: a secure context with the clipboard API. */
const canCopy = () =>
  typeof window !== "undefined" && window.isSecureContext !== false && typeof navigator.clipboard?.writeText === "function";

/**
 * Copies `text` to the clipboard, a check in the place of its icon for a while, said
 * to assistive tools. Not shown where the page may not write the clipboard (served
 * over plain http): no button that would do nothing. With `word`, that word beside
 * the icon: what it does read before a click, on a touch screen with no hover too.
 */
export function CopyButton({ text, label, size = "sm", word }: { text: string; label: string; size?: "sm" | "md"; word?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);
  if (!canCopy()) return null;
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
    });
  };
  return (
    <>
      {word === undefined ? (
        <IconButton size={size} label={copied ? t("common.copied") : label} onClick={copy}>
          {copied ? <CheckIcon className="text-state-up" /> : <CopyIcon />}
        </IconButton>
      ) : (
        <Button
          size="sm"
          aria-label={copied ? t("common.copied") : label}
          icon={copied ? <CheckIcon className="text-state-up" /> : <CopyIcon />}
          onClick={copy}
        >
          {copied ? t("common.copied") : word}
        </Button>
      )}
      <span className="sr-only" role="status">
        {copied ? t("common.copied") : ""}
      </span>
    </>
  );
}
