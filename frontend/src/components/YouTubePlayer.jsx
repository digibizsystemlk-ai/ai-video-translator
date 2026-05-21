import React, { useState, useEffect, useRef } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';

export default function YouTubePlayer({ videoId, onTimeUpdate, seekTrigger, activeSubtitleText, isShort, subtitlesLoading, lang }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);

  // Handle browser native fullscreen change events
  useEffect(() => {
    const handleFsChange = async () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      if (!isFS) {
        try {
          await ScreenOrientation.unlock();
        } catch (e) {
          console.warn("Screen orientation unlock failed:", e);
        }
        setIsFallbackFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('msfullscreenchange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('msfullscreenchange', handleFsChange);
    };
  }, []);



  // Ensure the video plays immediately and doesn't get blocked by subtitle loading
  useEffect(() => {
    if (!playerRef.current) return;
    if (typeof playerRef.current.playVideo === 'function') {
      playerRef.current.playVideo();
    }
  }, [videoId]);

  const handleFullscreenToggle = async () => {
    try {
      if (!isFallbackFullscreen) {
        setIsFallbackFullscreen(true);
        setIsFullscreen(true);
        try {
          await ScreenOrientation.lock({ orientation: isShort ? 'portrait' : 'landscape' });
        } catch (err) {
          console.warn("Screen orientation lock failed:", err);
        }
      } else {
        setIsFallbackFullscreen(false);
        setIsFullscreen(false);
        try {
          await ScreenOrientation.unlock();
        } catch (e) {
          console.warn("Screen orientation unlock failed:", e);
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  };

  useEffect(() => {
    if (!videoId) return;

    setHasStarted(false);
    let playerInstance = null;

    const startPolling = (player) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (player && typeof player.getCurrentTime === 'function') {
          const currentTime = player.getCurrentTime();
          onTimeUpdate(currentTime);
        }
      }, 150);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const createPlayer = () => {
      playerInstance = new window.YT.Player(containerRef.current, {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          fs: 0, // Custom overlays handle fullscreen manually to prevent YT interference
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            if (seekTrigger) {
              event.target.seekTo(seekTrigger.time, true);
            }
            startPolling(event.target);
            setHasStarted(true);

            // Always play immediately when ready!
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              startPolling(event.target);
            } else {
              stopPolling();
              if (event.target && typeof event.target.getCurrentTime === 'function') {
                onTimeUpdate(event.target.getCurrentTime());
              }
            }
          },
        },
      });
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        createPlayer();
      };
    } else if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const checkYTApi = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkYTApi);
          createPlayer();
        }
      }, 100);
    }

    return () => {
      stopPolling();
      if (playerInstance && typeof playerInstance.destroy === 'function') {
        playerInstance.destroy();
      }
      playerRef.current = null;
    };
  }, [videoId]);

  // Handle manual seek trigger shifts
  useEffect(() => {
    if (playerRef.current && seekTrigger && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seekTrigger.time, true);
      if (typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    }
  }, [seekTrigger]);

  return (
    <div ref={wrapperRef} className={`player-wrapper ${isFallbackFullscreen ? 'fallback-fullscreen' : ''}`} onDoubleClick={handleFullscreenToggle}>
      {/* Container holding the native YT Player iframe */}
      <div 
        style={{ 
          width: '100%', 
          height: '100%',
          opacity: hasStarted ? 1 : 0,
          pointerEvents: hasStarted ? 'auto' : 'none',
          transition: 'opacity 0.3s ease'
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
      </div>
      
      {/* Floating Action Button to toggle Fullscreen */}
      {hasStarted && (
        <button 
          className="custom-fullscreen-btn" 
          onClick={handleFullscreenToggle}
          title="Toggle Fullscreen (Double-Click Player)"
        >
          <i className="fa-solid fa-expand"></i>
        </button>
      )}

      {/* Mobile Inline Full Screen Assist Prompt */}
      {!isFullscreen && hasStarted && (
        <button 
          className="mobile-landscape-fs-prompt"
          onClick={handleFullscreenToggle}
        >
          <i className="fa-solid fa-expand" style={{ color: 'var(--accent-blue)' }}></i>
          Go Full Screen
        </button>
      )}

      {/* Premium floating glassmorphic status tag for subtitle loading progress */}
      {subtitlesLoading && (
        <div className="premium-floating-status">
          <div className="loading-spinner-tiny"></div>
          <span>Subtitles preparing... ⏳</span>
        </div>
      )}

      {/* Floating Subtitle Overlay */}
      {activeSubtitleText && (
        <div className="player-subtitle-overlay">
          <span className="player-subtitle-text">{activeSubtitleText}</span>
        </div>
      )}
    </div>
  );
}
