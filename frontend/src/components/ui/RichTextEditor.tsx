import { useEffect, useId, useRef } from 'react';
import Quill from 'quill';
import { cn } from '@/lib/cn';

/**
 * Only what the server's allowlist will actually keep.
 *
 * Offering a toolbar button whose output is stripped on save is worse than not offering
 * it: the user formats something, saves, and watches it vanish with no explanation.
 */
const TOOLBAR = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ header: 2 }, { header: 3 }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block'],
  ['link'],
  ['clean'],
];

const FORMATS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'header',
  'list',
  'blockquote',
  'code-block',
  'link',
];

/** Quill's empty document. Treated as "no description", not as content. */
const EMPTY = '<p><br></p>';

/**
 * Quill, wrapped as a controlled component.
 *
 * Quill owns its own DOM and its own undo history, so it is created once and never
 * re-created from props. Incoming `value` is written into the editor only when it
 * genuinely differs from what the editor already holds — assigning on every render
 * would move the caret to the start of the document on each keystroke, which is the
 * classic way a rich-text field becomes unusable.
 */
export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Descreva a demanda...',
  disabled = false,
  invalid = false,
  describedBy,
  id,
  ariaLabel,
  minHeight = '10rem',
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
  ariaLabel?: string;
  minHeight?: string;
}) {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  // Kept in a ref so the change handler never becomes stale without re-creating Quill.
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useEffect(() => {
    if (!hostRef.current || quillRef.current) {
      return;
    }

    const quill = new Quill(hostRef.current, {
      theme: 'snow',
      placeholder,
      modules: { toolbar: TOOLBAR },
      formats: FORMATS,
    });
    quillRef.current = quill;

    if (value && value !== EMPTY) {
      quill.clipboard.dangerouslyPasteHTML(value, 'silent');
    }

    quill.on('text-change', (_delta, _old, source) => {
      // 'api' changes are the ones this component made itself; echoing them back would
      // be a loop.
      if (source !== 'user') {
        return;
      }
      const html = quill.root.innerHTML;
      onChangeRef.current(html === EMPTY ? '' : html);
    });

    quill.root.addEventListener('blur', () => onBlurRef.current?.());
    quill.root.setAttribute('id', editorId);
    if (ariaLabel) {
      quill.root.setAttribute('aria-label', ariaLabel);
    }
    if (describedBy) {
      quill.root.setAttribute('aria-describedby', describedBy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Quill is created once, on purpose.
  }, []);

  // Only writes when the two really differ, to protect the caret.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) {
      return;
    }
    const current = quill.root.innerHTML === EMPTY ? '' : quill.root.innerHTML;
    if (current !== value) {
      quill.clipboard.dangerouslyPasteHTML(value || '', 'silent');
    }
  }, [value]);

  useEffect(() => {
    quillRef.current?.enable(!disabled);
  }, [disabled]);

  return (
    <div
      className={cn(
        'quill-host overflow-hidden rounded-lg border bg-surface transition-colors duration-150',
        invalid ? 'border-danger-border bg-danger-surface' : 'border-line',
        disabled && 'pointer-events-none opacity-60',
      )}
      style={{ ['--quill-min-height' as string]: minHeight }}
    >
      <div ref={hostRef} />
    </div>
  );
}
