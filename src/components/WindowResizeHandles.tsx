import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { ResizeEdge } from '../electron';

type HandleDef = {
  edge: ResizeEdge;
  className: string;
};

const HANDLES: HandleDef[] = [
  { edge: 'top', className: 'resize-handle resize-handle-top' },
  { edge: 'right', className: 'resize-handle resize-handle-right' },
  { edge: 'bottom', className: 'resize-handle resize-handle-bottom' },
  { edge: 'left', className: 'resize-handle resize-handle-left' },
  { edge: 'top-left', className: 'resize-handle resize-handle-top-left' },
  { edge: 'top-right', className: 'resize-handle resize-handle-top-right' },
  { edge: 'bottom-left', className: 'resize-handle resize-handle-bottom-left' },
  { edge: 'bottom-right', className: 'resize-handle resize-handle-bottom-right' }
];

export function WindowResizeHandles() {
  const [activeEdge, setActiveEdge] = useState<ResizeEdge | null>(null);

  useEffect(() => {
    if (!activeEdge) return;

    const onMouseMove = (event: MouseEvent) => {
      window.electron?.moveResize(event.screenX, event.screenY);
    };

    const onMouseUp = () => {
      window.electron?.endResize();
      setActiveEdge(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [activeEdge]);

  const handleMouseDown = async (edge: ResizeEdge, event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const started = await window.electron?.startResize(edge, event.screenX, event.screenY);
    if (started) {
      setActiveEdge(edge);
    }
  };

  return (
    <>
      {HANDLES.map((handle) => (
        <div
          key={handle.edge}
          className={handle.className}
          onMouseDown={(event) => {
            void handleMouseDown(handle.edge, event);
          }}
        />
      ))}
    </>
  );
}
