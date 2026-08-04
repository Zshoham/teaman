// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyCodeBlock, initCodeBlocks } from '../code-blocks';

function renderBlock(language = 'typescript', code = 'const answer = 42;\n') {
  document.body.innerHTML = `
    <div data-code-block data-language="${language}">
      <button type="button" data-copy-code aria-label="Copy ${language} code">Copy</button>
      <pre><code></code></pre>
    </div>`;
  const button = document.querySelector<HTMLButtonElement>('[data-copy-code]')!;
  document.querySelector('code')!.textContent = code;
  return button;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('code block copy buttons', () => {
  it('copies the source text and announces success before resetting', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const button = renderBlock();

    await expect(copyCodeBlock(button)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('const answer = 42;\n');
    expect(button.textContent).toBe('Copied');
    expect(button.dataset.state).toBe('copied');
    expect(button.getAttribute('aria-label')).toBe('Copied typescript code');

    vi.advanceTimersByTime(1800);
    expect(button.textContent).toBe('Copy');
    expect(button.dataset.state).toBeUndefined();
    expect(button.getAttribute('aria-label')).toBe('Copy typescript code');
  });

  it('reports a clipboard failure without throwing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const button = renderBlock('bash', 'npm test');

    await expect(copyCodeBlock(button)).resolves.toBe(false);
    expect(button.textContent).toBe('Copy failed');
    expect(button.getAttribute('aria-label')).toBe('Could not copy bash code');
  });

  it('initializes each generated button only once', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const button = renderBlock('rust', 'let value = 1;');

    initCodeBlocks();
    initCodeBlocks();
    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
