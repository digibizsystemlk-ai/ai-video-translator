import React, { useState, useEffect, useRef } from 'react';

export default function YouTubePlayer({ videoId, onTimeUpdate, seekTrigger, activeSubtitleText, isShort }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      if (!isFS) {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
          screen.orientation.unlock();
        }
        setHasStarted(false);
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
  }, [isShort]);

  const handleStartPlayImmersive = () => {
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.requestFullscreen().then(() => {
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
          screen.orientation.lock(isShort ? 'portrait' : 'landscape').catch(err => {
            console.warn("Screen orientation lock failed or ignored:", err);
          });
        }
      }).catch(err => {
        console.error("Fullscreen request failed:", err);
      });
    }

    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      playerRef.current.playVideo();
    }
    setHasStarted(true);
  };

  const handleFullscreenToggle = () => {
    const wrapper = wrapperRef.current;
    if (wrapper) {
      if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(err => {
          console.error("Error entering fullscreen:", err);
        });
      } else {
        document.exitFullscreen().catch(err => {
          console.error("Error exiting fullscreen:", err);
        });
      }
    }
  };

  useEffect(() => {
    if (!videoId) return;

    let playerInstance = null;

    // Helper to start the polling interval
    const startPolling = (player) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (player && typeof player.getCurrentTime === 'function') {
          const currentTime = player.getCurrentTime();
          onTimeUpdate(currentTime);
        }
      }, 150);
    };

    // Helper to stop polling
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const createPlayer = () => {
      // Create a new YT Player instance
      playerInstance = new window.YT.Player(containerRef.current, {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          fs: 0, // Disable native fullscreen button which hides custom elements
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            // Seek if we have an initial seek trigger
            if (seekTrigger) {
              event.target.seekTo(seekTrigger.time, true);
            }
            startPolling(event.target);
          },
          onStateChange: (event) => {
            // YT.PlayerState.PLAYING is 1
            if (event.data === window.YT.PlayerState.PLAYING) {
              startPolling(event.target);
            } else {
              stopPolling();
              // Update time once on pause/stop to capture exact spot
              if (event.target && typeof event.target.getCurrentTime === 'function') {
                onTimeUpdate(event.target.getCurrentTime());
              }
            }
          },
        },
      });
    };

    // Initialize YouTube Player API
    if (!window.YT) {
      // If script not loaded, inject it
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      // Global callback when API is ready
      window.onYouTubeIframeAPIReady = () => {
        createPlayer();
      };
    } else if (window.YT && window.YT.Player) {
      // API already loaded, just create player
      createPlayer();
    } else {
      // If script tag is in DOM but YT object is not ready yet, poll for it
      const checkYTApi = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkYTApi);
          createPlayer();
        }
      }, 100);
    }

    // Cleanup on unmount
    return () => {
      stopPolling();
      if (playerInstance && typeof playerInstance.destroy === 'function') {
        playerInstance.destroy();
      }
      playerRef.current = null;
    };
  }, [videoId]);

  // Handle Seek Trigger changes
  useEffect(() => {
    if (playerRef.current && seekTrigger && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seekTrigger.time, true);
      // Force play video on seeking
      if (typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    }
  }, [seekTrigger]);

  return (
    <div ref={wrapperRef} className="player-wrapper" onDoubleClick={handleFullscreenToggle}>
      <div 
        ref={containerRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          opacity: hasStarted ? 1 : 0,
          pointerEvents: hasStarted ? 'auto' : 'none',
          transition: 'opacity 0.3s ease'
        }}
      ></div>
      
      {/* Custom Fullscreen Toggle Button */}
      {hasStarted && (
        <button 
          className="custom-fullscreen-btn" 
          onClick={handleFullscreenToggle}
          title="Toggle Fullscreen (Double-Click Player)"
        >
          <i className="fa-solid fa-expand"></i>
        </button>
      )}

      {/* Mobile Landscape Full Screen Prompt Banner */}
      {!isFullscreen && hasStarted && (
        <button 
          className="mobile-landscape-fs-prompt"
          onClick={handleFullscreenToggle}
        >
          <i className="fa-solid fa-expand" style={{ color: 'var(--accent-blue)' }}></i>
          {localStorage.getItem('yt_translator_default_lang') === 'Sinhala' 
            ? 'පූර්ණ තිරය (Enter Full Screen)' 
            : 'Go Full Screen'}
        </button>
      )}

      {/* Immersive Premium Play Overlay */}
      {!hasStarted && (
        <div 
          className="immersive-play-overlay"
          onClick={handleStartPlayImmersive}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 999,
            background: 'rgba(10, 10, 12, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          <div className="immersive-play-button">
            <i className="fa-solid fa-circle-play"></i>
          </div>
          <span className="immersive-play-text">
            {localStorage.getItem('yt_translator_default_lang') === 'Sinhala' 
              ? (isShort ? 'පූර්ණ තිරයෙන් නරඹන්න (Play in Portrait Full Screen)' : 'හරස් අතට හරවා පූර්ණ තිරයෙන් නරඹන්න (Play in Landscape Full Screen)')
              : (isShort ? 'Watch in Full Screen' : 'Watch in Landscape Full Screen')}
          </span>
        </div>
      )}

      {/* Custom premium floating subtitle overlay */}
      {activeSubtitleText && (
        <div className="player-subtitle-overlay">
          <span className="player-subtitle-text">{activeSubtitleText}</span>
        </div>
      )}
    </div>
  );
}
