import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2Icon, Minimize2Icon, PenLineIcon, XIcon } from 'lucide-react';
import type {
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import excalidrawCssUrl from '@excalidraw/excalidraw/index.css?url';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  readStoredScene,
  whiteboardStorageKeys,
  writeStoredScene,
} from '@/lib/whiteboard-storage';

declare global {
  interface Window {
    // Excalidraw's documented hook for self-hosted fonts/assets.
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

const SAVE_DELAY = 500;

type SceneSnapshot = Parameters<NonNullable<ExcalidrawProps['onChange']>>;
type SaveStatus = 'saved' | 'saving' | 'error';

interface SceneSession {
  id: number;
  initialData: Promise<ExcalidrawInitialDataState | null>;
}

let serializeScene: typeof import('@excalidraw/excalidraw')['serializeAsJSON'] | null = null;

let excalidrawCssPromise: Promise<void> | null = null;

// Astro hoists island CSS — even from dynamic imports — into every page's
// <head>, so the ~140KB Excalidraw stylesheet is imported as a URL instead and
// linked only when the editor itself first loads.
function loadExcalidrawCss(): Promise<void> {
  excalidrawCssPromise ??= new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = excalidrawCssUrl;
    link.onload = () => resolve();
    // A failed stylesheet shouldn't hold the editor hostage; it still works.
    link.onerror = () => resolve();
    document.head.append(link);
  });
  return excalidrawCssPromise;
}

const Excalidraw = lazy(async () => {
  const [module] = await Promise.all([
    import('@excalidraw/excalidraw'),
    loadExcalidrawCss(),
  ]);
  serializeScene = module.serializeAsJSON;
  return { default: module.Excalidraw };
});

async function loadInitialData(
  keys: ReturnType<typeof whiteboardStorageKeys>,
): Promise<ExcalidrawInitialDataState | null> {
  const stored = await readStoredScene(keys);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as ExcalidrawInitialDataState;
  } catch {
    return null;
  }
}

function siteTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select, [contenteditable]') || target.isContentEditable
  );
}

interface WhiteboardProps {
  assetPath: string;
  siteBase: string;
}

export function Whiteboard({ assetPath, siteBase }: WhiteboardProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSceneRef = useRef<SceneSnapshot | null>(null);
  const sceneRevisionRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isViewportFullscreen, setIsViewportFullscreen] = useState(false);
  const storageKeys = useMemo(() => whiteboardStorageKeys(siteBase), [siteBase]);
  const [sceneSession, setSceneSession] = useState<SceneSession>({
    id: 0,
    initialData: Promise.resolve(null),
  });

  const prepareAssets = useCallback(() => {
    window.EXCALIDRAW_ASSET_PATH = new URL(assetPath, window.location.origin).href;
  }, [assetPath]);

  const flushScene = useCallback(async (showStatus = true) => {
    const scene = latestSceneRef.current;
    if (!scene || !serializeScene) return true;
    const revision = sceneRevisionRef.current;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    try {
      const [elements, appState, files] = scene;
      const serialized = serializeScene(elements, appState, files, 'local');
      const write = writeQueueRef.current
        .catch(() => undefined)
        .then(() => writeStoredScene(serialized, storageKeys));
      writeQueueRef.current = write;
      await write;
      if (showStatus && sceneRevisionRef.current === revision) setSaveStatus('saved');
      return true;
    } catch {
      if (showStatus && sceneRevisionRef.current === revision) setSaveStatus('error');
      return false;
    }
  }, [storageKeys]);

  const handleSceneChange: NonNullable<ExcalidrawProps['onChange']> = useCallback(
    (elements, appState, files) => {
      if (!isOpenRef.current) return;

      latestSceneRef.current = [elements, appState, files];
      sceneRevisionRef.current += 1;
      setSaveStatus('saving');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void flushScene(), SAVE_DELAY);
    },
    [flushScene],
  );

  const handleOpenChange = useCallback((open: boolean) => {
    isOpenRef.current = open;
    if (open) {
      prepareAssets();
      latestSceneRef.current = null;
      const pendingWrites = writeQueueRef.current;
      setSceneSession((current) => ({
        id: current.id + 1,
        initialData: pendingWrites
          .catch(() => undefined)
          .then(() => loadInitialData(storageKeys)),
      }));
      return;
    }

    void flushScene();
    if (document.fullscreenElement) void document.exitFullscreen();
    setIsViewportFullscreen(false);
  }, [flushScene, prepareAssets, storageKeys]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        return;
      } catch {}
    }

    setIsViewportFullscreen((current) => !current);
  }, []);

  useEffect(() => {
    prepareAssets();
    setTheme(siteTheme());

    const themeObserver = new MutationObserver(() => setTheme(siteTheme()));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === document.documentElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const handleShortcut = (event: KeyboardEvent) => {
      if (
        isOpenRef.current ||
        event.key.toLowerCase() !== 'w' ||
        !event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) return;

      event.preventDefault();
      prepareAssets();
      triggerRef.current?.click();
    };
    window.addEventListener('keydown', handleShortcut);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void flushScene(false);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      themeObserver.disconnect();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleShortcut);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void flushScene(false);
    };
  }, [flushScene, prepareAssets]);

  const expanded = isFullscreen || isViewportFullscreen;

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger
        ref={triggerRef}
        render={
          <Button
            type="button"
            variant="outline"
            size="xl"
            onClick={prepareAssets}
            className="whiteboard-launcher fixed right-6 bottom-6 z-40 rounded-xl shadow-xl"
            aria-label="Open whiteboard"
            aria-keyshortcuts="Shift+W"
            title="Open whiteboard (Shift+W)"
          />
        }
      >
        <PenLineIcon data-icon="inline-start" className="text-primary" />
        <span className="whiteboard-launcher-label">Whiteboard</span>
      </DialogTrigger>

      <DialogContent
        showClose={false}
        className={cn(
          'top-1/2! h-[min(88dvh,860px)] max-h-none w-[min(96vw,1440px)] max-w-none -translate-y-1/2! overflow-hidden p-0',
          expanded && 'inset-0! h-dvh w-screen max-w-none translate-x-0! translate-y-0! rounded-none border-0',
        )}
      >
        <div
          ref={workspaceRef}
          data-whiteboard-workspace
          className="flex size-full flex-col overflow-hidden bg-background"
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
            <PenLineIcon className="size-4 text-primary" aria-hidden="true" />
            <DialogTitle className="font-mono text-meta-lg font-medium">
              Whiteboard
            </DialogTitle>
            <DialogDescription className="sr-only">
              A persistent Excalidraw canvas. Changes are saved in this browser.
            </DialogDescription>
            <span
              data-whiteboard-save-status={saveStatus}
              className={cn(
                'font-mono text-meta-sm text-faint',
                saveStatus === 'error' && 'text-destructive',
              )}
              aria-live="polite"
              aria-atomic="true"
              title={saveStatus === 'error'
                ? 'Browser storage is unavailable or full.'
                : undefined}
            >
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'error'
                  ? 'Couldn’t save changes'
                  : 'Saved in this browser'}
            </span>

            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void toggleFullscreen()}
                aria-label={expanded ? 'Exit full screen' : 'Enter full screen'}
                title={expanded ? 'Exit full screen' : 'Enter full screen'}
              >
                {expanded
                  ? <Minimize2Icon data-icon="inline-start" />
                  : <Maximize2Icon data-icon="inline-start" />}
                <span className="hidden sm:inline">{expanded ? 'Restore' : 'Full screen'}</span>
              </Button>
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close whiteboard"
                    title="Close whiteboard"
                  />
                }
              >
                <XIcon />
              </DialogClose>
            </div>
          </div>

          <div className="min-h-0 flex-1 bg-muted">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center font-mono text-meta-lg text-muted-foreground">
                  Loading whiteboard…
                </div>
              }
            >
              <Excalidraw
                key={sceneSession.id}
                initialData={sceneSession.initialData}
                onChange={handleSceneChange}
                theme={theme}
                name="teaman-whiteboard"
                autoFocus
                UIOptions={{ canvasActions: { toggleTheme: false } }}
              />
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
