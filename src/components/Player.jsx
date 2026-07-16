import { useEffect, useRef } from 'react';

export default function Player({ src, title, onProgress }) {
  const iframeRef = useRef(null);
  const savedCallback = useRef(onProgress);
  savedCallback.current = onProgress;

  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type !== 'PLAYER_EVENT') return;
      const { event, currentTime } = e.data.data;
      if (event === 'time' && savedCallback.current) {
        savedCallback.current(currentTime);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="player-wrapper">
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
        className="player-iframe"
      />
    </div>
  );
}
