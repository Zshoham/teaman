import { useEffect, useRef, useState } from "react";

const PARAM = "adr";

/** The ADR named by `?adr=` in the URL, if it exists in the current index. */
function paramTarget<T>(lookup: Map<string, T>): string | null {
  const num = new URLSearchParams(location.search).get(PARAM);
  return num && lookup.has(num) ? num : null;
}

/** Current URL with `?adr=` set to `num` (or removed when null); hash untouched. */
function withAdrParam(num: string | null): string {
  const url = new URL(location.href);
  if (num) url.searchParams.set(PARAM, num);
  else url.searchParams.delete(PARAM);
  return url.pathname + url.search + url.hash;
}

/**
 * Keeps the open ADR modal in sync with a `?adr=<num>` query param. The param
 * (not the hash) is the modal's source of truth, so in-body heading anchors
 * (`#context`, …) stay free to work without dismissing the modal.
 */
export function useAdrModalState<T>(lookup: Map<string, T>) {
  const [openNum, setOpenNum] = useState<string | null>(null);
  const lastShown = useRef<T | undefined>(undefined);

  // Open from the param on mount and follow browser back/forward.
  useEffect(() => {
    const syncFromUrl = () => setOpenNum(paramTarget(lookup));
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [lookup]);

  // Reflect the open modal back into the param, leaving the hash alone.
  useEffect(() => {
    const current = new URLSearchParams(location.search).get(PARAM);
    if (current !== openNum) {
      history.replaceState(null, "", withAdrParam(openNum));
    }
  }, [openNum]);

  const current = openNum ? lookup.get(openNum) : undefined;
  if (current) lastShown.current = current;

  return {
    openNum,
    setOpenNum,
    shown: current ?? lastShown.current,
  };
}
