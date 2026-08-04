const FEEDBACK_MS = 1800;
const initializedRoots = new WeakSet<EventTarget>();

function codeBlockFor(button: HTMLButtonElement): HTMLElement | null {
  return button.closest<HTMLElement>('[data-code-block]');
}

function setButtonState(button: HTMLButtonElement, state: 'idle' | 'copied' | 'error') {
  const block = codeBlockFor(button);
  const language = block?.dataset.language ?? 'code';

  if (state === 'copied') {
    button.dataset.state = state;
    button.textContent = 'Copied';
    button.setAttribute('aria-label', `Copied ${language} code`);
  } else if (state === 'error') {
    button.dataset.state = state;
    button.textContent = 'Copy failed';
    button.setAttribute('aria-label', `Could not copy ${language} code`);
  } else {
    // The resting state carries no attribute, so a button that has been used
    // is indistinguishable from one that never has.
    delete button.dataset.state;
    button.textContent = 'Copy';
    button.setAttribute('aria-label', `Copy ${language} code`);
  }
}

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  // `navigator.clipboard` is restricted to secure contexts. Keep the button
  // useful on local HTTP previews and older browsers with the conventional
  // temporary-textarea fallback.
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) throw new Error('Copy command was rejected');
  } finally {
    textarea.remove();
  }
}

/** Copy the source text associated with one generated code-block button. */
export async function copyCodeBlock(button: HTMLButtonElement): Promise<boolean> {
  const block = codeBlockFor(button);
  const code = block?.querySelector('pre code');
  if (!code) return false;

  const previousTimer = Number(button.dataset.resetTimer);
  if (Number.isFinite(previousTimer)) window.clearTimeout(previousTimer);

  let copied = true;
  try {
    await writeClipboard(code.textContent ?? '');
    setButtonState(button, 'copied');
  } catch {
    copied = false;
    setButtonState(button, 'error');
  }

  const timer = window.setTimeout(() => {
    setButtonState(button, 'idle');
    delete button.dataset.resetTimer;
  }, FEEDBACK_MS);
  button.dataset.resetTimer = String(timer);
  return copied;
}

/**
 * Attach one delegated clipboard listener for all rendered code blocks. A
 * reference can contain hundreds of samples, so delegation avoids allocating
 * a separate closure for every button in a book-sized document.
 */
export function initCodeBlocks(root: Document | HTMLElement = document): void {
  if (initializedRoots.has(root)) return;
  initializedRoots.add(root);
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-copy-code]');
    if (!button || (root instanceof HTMLElement && !root.contains(button))) return;
    void copyCodeBlock(button);
  });
}
