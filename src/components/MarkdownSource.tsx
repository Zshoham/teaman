import { useState } from 'react';
import { Download, FileCode, X } from 'lucide-react';
import { Button, buttonVariants } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';

interface Props {
  href: string;
  filename: string;
}

export function MarkdownSource({ href, filename }: Props) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || source !== undefined || loading) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error('Source request failed');
      setSource(await response.text());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="markdown-source shrink-0" data-pagefind-ignore>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label="View Markdown source"
          title="View Markdown source"
        >
          <FileCode />
        </DialogTrigger>
        <DialogContent className="max-w-[920px]" aria-describedby={undefined} showClose={false}>
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-5">
            <DialogTitle className="min-w-0 flex-1">Markdown source</DialogTitle>
            <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={href} download={filename}>
              <Download data-icon="inline-start" />
              Download Markdown
            </a>
            <DialogClose render={<Button variant="ghost" size="icon-sm" />} aria-label="Close">
              <X />
            </DialogClose>
          </div>
          {loading && <p role="status" className="p-6 text-sm text-muted-foreground">Loading Markdown…</p>}
          {error && (
            <div className="p-6">
              <p role="alert" className="text-sm text-muted-foreground">Could not load Markdown.</p>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>Try again</Button>
            </div>
          )}
          {source !== undefined && (
            <ScrollArea className="h-[min(70vh,600px)] min-h-0" horizontalScrollbar>
              <pre aria-label="Markdown source" className="m-0 p-6 text-left font-mono text-sm">
                <code>{source}</code>
              </pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
