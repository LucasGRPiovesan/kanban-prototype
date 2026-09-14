import { useEffect, useRef, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/** On-screen diameter of the circular viewport, in pixels. */
const VIEWPORT_SIZE = 256;
/** Exported image side, in pixels — comfortably sharp at every size the app draws an avatar. */
const OUTPUT_SIZE = 480;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Pick where a picture is cropped before it becomes an avatar.
 *
 * The viewport is the circle itself, not a square with a circular guide drawn over it —
 * what fills it here is exactly what a rounded `Avatar` shows everywhere else in the
 * app, so there is nothing left to imagine. Dragging pans, the slider zooms; the export
 * is a plain square PNG (the visible circle's bounding box) since every avatar in this
 * app is already rounded by CSS wherever it is drawn — cropping to an actual circular
 * shape here would just throw away the corners a browser was going to hide anyway.
 */
export function AvatarCropModal({
  file,
  onCancel,
  onConfirm,
  loading = false,
}: {
  /** `null` keeps the modal closed — the same on/off signal `Modal`'s own `open` uses. */
  file: File | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  loading?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragOrigin = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
    null,
  );

  // A fresh file resets every knob — the previous picture's pan and zoom mean nothing
  // for a new one.
  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      setNatural(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** Cover-fit at zoom 1: the shorter side of the image exactly fills the circle. */
  const baseScale = natural
    ? Math.max(VIEWPORT_SIZE / natural.width, VIEWPORT_SIZE / natural.height)
    : 1;
  const scale = baseScale * zoom;
  const displayed = natural
    ? { width: natural.width * scale, height: natural.height * scale }
    : { width: VIEWPORT_SIZE, height: VIEWPORT_SIZE };

  const clampOffset = (value: { x: number; y: number }, displayedSize = displayed) => {
    const maxX = Math.max(0, (displayedSize.width - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (displayedSize.height - VIEWPORT_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, value.x)),
      y: Math.min(maxY, Math.max(-maxY, value.y)),
    };
  };

  // Re-clamp whenever zoom changes, so zooming out never leaves the image stranded off
  // to one side with empty space showing on the other.
  useEffect(() => {
    setOffset((current) => clampOffset(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural]);

  const handlePointerDown = (event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture(event.pointerId);
    dragOrigin.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const origin = dragOrigin.current;
    if (!origin) {
      return;
    }
    setOffset(
      clampOffset({
        x: origin.offsetX + (event.clientX - origin.x),
        y: origin.offsetY + (event.clientY - origin.y),
      }),
    );
  };

  const endDrag = () => {
    dragOrigin.current = null;
  };

  const confirm = () => {
    if (!natural) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx || !imgRef.current) {
      return;
    }
    const canvasScale = OUTPUT_SIZE / VIEWPORT_SIZE;
    const drawWidth = natural.width * scale * canvasScale;
    const drawHeight = natural.height * scale * canvasScale;
    const dx = OUTPUT_SIZE / 2 + offset.x * canvasScale - drawWidth / 2;
    const dy = OUTPUT_SIZE / 2 + offset.y * canvasScale - drawHeight / 2;
    ctx.drawImage(imgRef.current, dx, dy, drawWidth, drawHeight);
    canvas.toBlob((blob) => {
      if (blob) {
        onConfirm(blob);
      }
    }, 'image/png');
  };

  return (
    <Modal
      open={Boolean(file)}
      onClose={onCancel}
      title="Ajustar foto de perfil"
      description="Arraste para posicionar e use o controle para aproximar. O círculo é exatamente o que aparecerá."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={confirm} loading={loading} disabled={!natural}>
            Usar esta foto
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2">
        {/*
          A drag surface, not a semantic control — the same reasoning DemandCard gives
          its own pointer handlers to the card's root element rather than a button.
        */}
        <div
          className="relative touch-none select-none overflow-hidden rounded-full border border-line-strong bg-surface-muted shadow-inner"
          style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {imageUrl && (
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const target = event.currentTarget;
                setNatural({ width: target.naturalWidth, height: target.naturalHeight });
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none cursor-grab active:cursor-grabbing"
              style={{
                width: displayed.width,
                height: displayed.height,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>

        <label className="flex w-full max-w-[16rem] items-center gap-2.5 text-subtle">
          <ZoomIn className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Zoom da foto"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-muted accent-brand-500"
            disabled={!natural}
          />
        </label>
      </div>
    </Modal>
  );
}
