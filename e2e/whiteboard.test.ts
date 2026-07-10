import { test, expect } from '@playwright/test';

test.describe('whiteboard', () => {
  test('is available from both the home page and a content page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open whiteboard' })).toBeVisible();

    await page.goto('/notes/tools-for-thought/');
    await expect(page.getByRole('button', { name: 'Open whiteboard' })).toBeVisible();
  });

  test('opens Excalidraw from the persistent launcher and the keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open whiteboard' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Whiteboard' })).toBeVisible();
    await expect(page.locator('.excalidraw')).toBeVisible();

    await page.getByRole('button', { name: 'Close whiteboard' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.keyboard.press('Shift+w');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('reloads the latest saved scene whenever it reopens', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: undefined,
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open whiteboard' }).click();
    await expect(page.locator('.excalidraw')).toBeVisible();
    await expect(page.locator('[data-whiteboard-save-status="saved"]')).toBeVisible();
    await page.getByRole('button', { name: 'Close whiteboard' }).click();

    await page.evaluate(() => {
      localStorage.setItem('teaman-whiteboard-scene:/', JSON.stringify({
        type: 'excalidraw',
        version: 2,
        source: 'teaman-test',
        elements: [{
          id: 'persisted-rectangle',
          type: 'rectangle',
          x: 100,
          y: 100,
          width: 120,
          height: 80,
          angle: 0,
          strokeColor: '#1e1e1e',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          index: 'a0',
          roundness: { type: 3 },
          seed: 1,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
          boundElements: null,
          updated: 1,
          link: null,
          locked: false,
        }],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      }));
    });

    await page.getByRole('button', { name: 'Open whiteboard' }).click();
    await expect(page.locator('.excalidraw')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const stored = localStorage.getItem('teaman-whiteboard-scene:/');
      if (!stored) return [];
      return JSON.parse(stored).elements.map((element: { id: string }) => element.id);
    })).toContain('persisted-rectangle');
  });

  test('reports when browser storage cannot save changes', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: undefined,
      });
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('teaman-whiteboard-scene:')) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        return setItem.call(this, key, value);
      };
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open whiteboard' }).click();
    await expect(page.locator('.excalidraw')).toBeVisible();

    await expect(page.locator('[data-whiteboard-save-status="error"]')).toHaveText(
      'Couldn’t save changes',
    );
  });

  test('expands the workspace to fill the browser screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open whiteboard' }).click();
    const workspace = page.locator('[data-whiteboard-workspace]');
    await expect(page.locator('.excalidraw')).toBeVisible();

    await page.getByRole('button', { name: 'Enter full screen' }).click();
    await expect.poll(() => page.evaluate(
      () => document.fullscreenElement === document.documentElement,
    )).toBe(true);

    const viewport = page.viewportSize();
    // Chromium's fullscreen top layer can round a few CSS pixels at the
    // device-scale boundary. The dialog also transitions to its fullscreen
    // dimensions, so wait for that transition before checking coverage.
    await expect.poll(async () => (await workspace.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(viewport!.width * 0.99);
    await expect.poll(async () => (await workspace.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(viewport!.height * 0.99);
  });

  test('shows Excalidraw export dialogs in full screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open whiteboard' }).click();
    await expect(page.locator('.excalidraw')).toBeVisible();
    await page.getByRole('button', { name: 'Enter full screen' }).click();
    await expect.poll(() => page.evaluate(
      () => document.fullscreenElement === document.documentElement,
    )).toBe(true);

    await page.getByTestId('main-menu-trigger').click();
    await page.getByTestId('image-export-button').click();

    const exportDialog = page.locator('.excalidraw-modal-container .Modal');
    await expect(exportDialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const modal = document.querySelector('.excalidraw-modal-container');
      return Boolean(modal && document.fullscreenElement?.contains(modal));
    })).toBe(true);
  });
});
