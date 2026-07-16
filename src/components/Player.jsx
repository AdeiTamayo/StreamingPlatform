import { useEffect, useRef } from 'react';

export default function Player({ src, title, onProgress, onEnded }) {
  const iframeRef = useRef(null);
  const savedCallback = useRef(onProgress);
  const savedEndedCallback = useRef(onEnded);
  savedCallback.current = onProgress;
  savedEndedCallback.current = onEnded;

  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type !== 'PLAYER_EVENT') return;
      const { event, currentTime } = e.data.data;
      if (event === 'time' && savedCallback.current) {
        savedCallback.current(currentTime);
      } else if ((event === 'ended' || event === 'complete') && savedEndedCallback.current) {
        savedEndedCallback.current();
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
