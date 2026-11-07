import { useEffect, useState } from 'react';
import { useAppState } from '../state/store';

/**
 * One polite live region that stays mounted. A new announcement first
 * clears the text, then sets it on the next frame, so screen readers
 * speak repeated and back-to-back messages. Mounted once by App, so
 * announcements made from any view (Escape stopping a job, shortcuts
 * that cannot run) are heard.
 */
export function Announcer() {
  const announcement = useAppState((s) => s.announcement);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!announcement.text) return;
    setText('');
    const frame = requestAnimationFrame(() => setText(announcement.text));
    return () => cancelAnimationFrame(frame);
  }, [announcement]);
  return (
    <p id="announcer" className="visually-hidden" role="status" aria-live="polite">
      {text}
    </p>
  );
}
