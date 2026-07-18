import { useEffect, useRef } from 'react';

export default function Player({ src, title, onProgress, onEnded, runtimeMinutes }) {
  const iframeRef = useRef(null);
  const savedCallback = useRef(onProgress);
  const savedEndedCallback = useRef(onEnded);
  const elapsedRef = useRef(0);
  const pollRef = useRef(null);

  savedCallback.current = onProgress;
  savedEndedCallback.current = onEnded;

  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type !== 'PLAYER_EVENT') return;
      const { event, currentTime } = e.data.data;
      if (event === 'time' && savedCallback.current) {
        savedCallback.current(currentTime);
        elapsedRef.current = currentTime;
      } else if ((event === 'ended' || event === 'complete') && savedEndedCallback.current) {
        savedEndedCallback.current();
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    elapsedRef.current = 0;
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      elapsedRef.current += 10;
      if (savedCallback.current) {
        savedCallback.current(elapsedRef.current);
      }
      if (runtimeMinutes) {
        const runtimeSeconds = runtimeMinutes * 60;
        if (elapsedRef.current >= runtimeSeconds && savedEndedCallback.current) {
          savedEndedCallback.current();
          clearInterval(pollRef.current);
        }
      }
    }, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [src, runtimeMinutes]);

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
