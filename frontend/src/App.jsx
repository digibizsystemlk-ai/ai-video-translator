import React, { useState, useEffect, useRef } from 'react';
import YouTubePlayer from './components/YouTubePlayer';

const getYouTubeId = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  const trimmed = url.trim();
  if (trimmed.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
};

const LANGUAGES = [
  { code: 'Sinhala', name: 'සිංහල (Sinhala)' },
  { code: 'Tamil', name: 'தமிழ் (Tamil)' },
  { code: 'English', name: 'English (English)' },
  { code: 'Spanish', name: 'Español (Spanish)' },
  { code: 'French', name: 'Français (French)' },
  { code: 'German', name: 'Deutsch (German)' },
  { code: 'Japanese', name: '日本語 (Japanese)' },
  { code: 'Chinese', name: '中文 (Chinese)' },
  { code: 'Hindi', name: 'हिन्दी (Hindi)' },
  { code: 'Arabic', name: 'العربية (Arabic)' }
];

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const uiTranslations = {
  Sinhala: {
    appTitle: "YT වීඩියෝ පරිවර්තකය",
    inputLabel: "YouTube වීඩියෝ ලින්ක් එක",
    inputPlaceholder: "YouTube වීඩියෝ ලින්ක් එක මෙතැනට ඇතුළත් කරන්න...",
    btnTranslate: "පරිවර්තනය සහ සාරාංශය",
    btnProcessing: "පරිවර්තනය වෙමින් පවතී...",
    errorTitle: "පරිවර්තනය කිරීමේ දෝෂයකි:",
    loadingTitle: "වීඩියෝව විශ්ලේෂණය කරමින් පවතී",
    loadingText: (seconds) => `තව තත්පර ${seconds} කින් සූදානම් වේ. රැඳී සිටින්න...`,
    readyTitle: "පරිවර්තනය සඳහා සූදානම්",
    readyText: "ඉහතින් YouTube ලින්ක් එකක් ලබා දී, පරිවර්තනය කළ යුතු භාෂාව තෝරාගන්න.",
    tabTranscript: "ලිඛිත පිටපත (Interactive Transcript)"
  },
  English: {
    appTitle: "YT Video Translator",
    inputLabel: "YouTube Video Link",
    inputPlaceholder: "https://www.youtube.com/watch?v=...",
    btnTranslate: "Translate & Summarize",
    btnProcessing: "Processing...",
    errorTitle: "Error Processing Request:",
    loadingTitle: "Analyzing the video",
    loadingText: (seconds) => `Ready in about ${seconds} seconds. Please wait...`,
    readyTitle: "Ready for Translation",
    readyText: "Paste a YouTube link above and choose a target translation language.",
    tabTranscript: "Interactive Transcript"
  }
};

const isLocalDevEnv = () => {
  return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
         (window.location.port === '5173' || window.location.port === '3000');
};

const DEFAULT_PRODUCTION_API_URL = isLocalDevEnv()
  ? 'http://localhost:8080'
  : 'https://digibiz-apps.web.app';

const arrayBufferToBase64 = (buffer) => {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer], { type: 'audio/mp3' });
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function App() {
  const [url, setUrl] = useState('');
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('yt_translator_default_lang') || 'English';
  });
  const [loading, setLoading] = useState(false);
  const [subtitlesLoading, setSubtitlesLoading] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState('');
  const [subtitleError, setSubtitleError] = useState('');
  const [processedData, setProcessedData] = useState(null);
  const [activeTime, setActiveTime] = useState(0);
  const [seekTrigger, setSeekTrigger] = useState(null);

  const [showSettings, setShowSettings] = useState(false);
  const [tempLang, setTempLang] = useState(lang);
  const [subtitleSize, setSubtitleSize] = useState(() => {
    return localStorage.getItem('yt_translator_subtitle_size') || 'medium';
  });
  const [tempSubtitleSize, setTempSubtitleSize] = useState(subtitleSize);

  const [apiBase, setApiBase] = useState(() => {
    // In production environments (APK or live website), ALWAYS force the production API URL!
    if (!isLocalDevEnv()) {
      return 'https://digibiz-apps.web.app';
    }

    let saved = localStorage.getItem('yt_translator_api_base');
    if (!saved || saved.includes('192.168.8.') || saved.includes('192.168.1.') || saved.includes('digibiz-apps.web.app')) {
      saved = 'http://localhost:8080';
      localStorage.setItem('yt_translator_api_base', saved);
    }
    return saved;
  });
  const [tempApiBase, setTempApiBase] = useState(apiBase);

  const handleSaveSettings = () => {
    localStorage.setItem('yt_translator_default_lang', tempLang);
    localStorage.setItem('yt_translator_subtitle_size', tempSubtitleSize);
    localStorage.setItem('yt_translator_subtitle_size_user_override', 'true');
    localStorage.setItem('yt_translator_api_base', tempApiBase);
    setLang(tempLang);
    setSubtitleSize(tempSubtitleSize);
    setApiBase(tempApiBase);
    setShowSettings(false);
  };
  
  const transcriptContainerRef = useRef(null);
  const t = uiTranslations.English;
  const handleSubmitRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text') || params.get('title');
    if (sharedUrl) {
      const youtubeRegex = /(https?:\/\/[^\s]+)/;
      const match = sharedUrl.match(youtubeRegex);
      if (match && match[0]) {
        setUrl(match[0]);
        if (handleSubmitRef.current) {
          handleSubmitRef.current(null, match[0]);
        }
      }
    }

    const handleNativeShare = (event) => {
      const sharedText = event.detail;
      if (sharedText) {
        const youtubeRegex = /(https?:\/\/[^\s]+)/;
        const match = sharedText.match(youtubeRegex);
        if (match && match[0]) {
          const newUrl = match[0];
          setUrl(newUrl);
          setProcessedData(null);
          setError('');
          setActiveTime(0);
          setSeekTrigger(null);

          if (handleSubmitRef.current) {
            handleSubmitRef.current(null, newUrl);
          }
        }
      }
    };

    window.addEventListener('youtubeShareReceived', handleNativeShare);
    return () => {
      window.removeEventListener('youtubeShareReceived', handleNativeShare);
    };
  }, []);

  const isSameLanguage = processedData && 
    processedData.sourceLanguage && 
    processedData.sourceLanguage.toLowerCase() === lang.toLowerCase();

  let activeSubtitleIndex = -1;
  let activeSubtitleText = '';
  
  if (processedData && processedData.subtitles && !isSameLanguage) {
    activeSubtitleIndex = processedData.subtitles.findIndex(
      (sub) => activeTime >= sub.start && activeTime <= sub.end
    );

    if (activeSubtitleIndex === -1 && processedData.subtitles.length > 0) {
      for (let i = processedData.subtitles.length - 1; i >= 0; i--) {
        if (activeTime >= processedData.subtitles[i].start) {
          activeSubtitleIndex = i;
          break;
        }
      }
    }

    if (activeSubtitleIndex !== -1) {
      activeSubtitleText = processedData.subtitles[activeSubtitleIndex].sinhala || processedData.subtitles[activeSubtitleIndex].text;
    }
  }

  useEffect(() => {
    if (activeSubtitleIndex !== -1) {
      const activeElement = document.getElementById(`sub-item-${activeSubtitleIndex}`);
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [activeSubtitleIndex]);

  const handleSubmit = async (e, targetUrl = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const activeUrl = targetUrl || url;
    if (!activeUrl.trim()) return;

    const parsedVideoId = getYouTubeId(activeUrl);
    if (!parsedVideoId) {
      setError('Invalid YouTube link. Please enter the full link.');
      setProcessedData(null);
      return;
    }

    // Reset errors and instantly set the video ID to load the player within 1 second!
    setError('');
    setSubtitleError('');
    setProcessedData({ videoId: parsedVideoId, subtitles: [] });
    setActiveTime(0);
    setSeekTrigger(null);
    
    setSubtitlesLoading(true);
    setCountdown(15);
    
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 1 : prev - 1));
    }, 1000);

    try {
      const response = await fetch(`${apiBase}/api/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: activeUrl, lang: lang })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'පරිවර්තනය අසාර්ථක විය.');

      if (data.fallback === 'client_audio_download') {
        console.log('⚡ Level 2 Fallback: Captions missing. Fetching audio client-side silently.');
        setCountdown(25); // Extend countdown for the transcription & translation phase
        
        const cobaltInstances = data.cobaltInstances || [
          'https://api.cobalt.blackcat.sweeux.org',
          'https://fox.kittycat.boo',
          'https://api.dl.woof.monster'
        ];
        
        let audioBuffer = null;
        let success = false;
        
        for (const api of cobaltInstances) {
          console.log(`[Cobalt client fetch] Attempting download via instance: ${api}`);
          try {
            const cobaltRes = await fetch(api, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                url: `https://www.youtube.com/watch?v=${parsedVideoId}`,
                downloadMode: 'audio',
                audioFormat: 'mp3',
                audioBitrate: '128'
              })
            });

            if (!cobaltRes.ok) {
              console.warn(`[Cobalt client fetch Warning] Instance ${api} returned status: ${cobaltRes.status}`);
              continue;
            }

            const cobaltData = await cobaltRes.json();
            if (cobaltData.url) {
              console.log(`[Cobalt client fetch] Got stream URL: ${cobaltData.url}`);
              
              const streamRes = await fetch(cobaltData.url);
              if (!streamRes.ok) {
                console.warn(`[Cobalt client fetch Warning] Stream fetch failed from ${cobaltData.url}: ${streamRes.status}`);
                continue;
              }
              
              audioBuffer = await streamRes.arrayBuffer();
              if (audioBuffer && audioBuffer.byteLength > 0) {
                console.log(`[Cobalt client fetch] Successfully downloaded audio buffer: ${audioBuffer.byteLength} bytes.`);
                success = true;
                break;
              }
            }
          } catch (instanceErr) {
            console.warn(`[Cobalt client fetch Warning] Error with instance ${api}:`, instanceErr.message);
          }
        }

        if (!success || !audioBuffer) {
          throw new Error('Could not fetch video audio track. Please try again.');
        }

        // Convert downloaded audio ArrayBuffer to Base64 using FileReader
        const base64Audio = await arrayBufferToBase64(audioBuffer);
        
        // Post base64 audio to the backend /api/process-audio endpoint
        const audioProcessRes = await fetch(`${apiBase}/api/process-audio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            videoId: parsedVideoId,
            lang: lang,
            audioBase64: base64Audio,
            mimeType: 'audio/mp3'
          })
        });

        const audioProcessData = await audioProcessRes.json();
        if (!audioProcessRes.ok) throw new Error(audioProcessData.error || 'පරිවර්තනය අසාර්ථක විය.');
        
        setProcessedData(audioProcessData);
      } else {
        setProcessedData(data);
      }
    } catch (err) {
      console.error(err);
      setSubtitleError(err.message || 'Failed to translate subtitles.');
    } finally {
      clearInterval(timer);
      setSubtitlesLoading(false);
    }
  };

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  const handleSubtitleClick = (subtitle) => {
    setSeekTrigger({ time: subtitle.start, timestamp: Date.now() });
    setActiveTime(subtitle.start);
  };

  const sizeMultipliers = { xsmall: '0.55', small: '0.75', medium: '1.0', large: '1.25', xlarge: '1.55' };

  return (
    <div className={`app-container ${processedData ? 'has-video' : ''}`} style={{ '--subtitle-scale': sizeMultipliers[subtitleSize] || '1.0' }}>
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div className="app-logo" style={{ cursor: 'pointer' }} onClick={() => {
          setProcessedData(null);
          setUrl('');
          setError('');
          setSubtitleError('');
          setActiveTime(0);
          setSeekTrigger(null);
        }}>
          <i className="fa-brands fa-youtube" style={{ color: '#FF0000', fontSize: '2.4rem' }}></i>
          <span className="logo-brand-yt">YT</span>
          <span className="logo-brand-translator">Translator</span>
        </div>
        
        <button 
          className="btn-settings" 
          onClick={() => {
            setTempLang(lang);
            setTempSubtitleSize(subtitleSize);
            setShowSettings(true);
          }}
          style={{ background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: 'white', width: '42px', height: '42px', borderRadius: '50%' }}
        >
          <i className="fa-solid fa-gear" style={{ fontSize: '1.2rem' }}></i>
        </button>
      </header>

      <div className="input-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group-row">
            <div className="form-field">
              <label className="form-label">{t.inputLabel}</label>
              <input
                className="form-input"
                type="url"
                placeholder={t.inputPlaceholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? <span>{t.btnProcessing}</span> : <span>{t.btnTranslate}</span>}
            </button>
          </div>
        </form>
      </div>

      {error && <div className="error-message"><strong>{t.errorTitle}</strong> {error}</div>}

      {loading && (
        <div className="input-card" style={{ padding: '4.5rem 2rem', textAlign: 'center' }}>
          <div className="loading-spinner"></div>
          <h3>{t.loadingTitle}</h3>
          <p>{t.loadingText(countdown)}</p>
        </div>
      )}

      {!loading && !processedData && !error && (
        <div className="input-card" style={{ padding: '5rem 2rem', textAlign: 'center' }}>
          <h3>{t.readyTitle}</h3>
          <p>{t.readyText}</p>
        </div>
      )}

      {processedData && (
        <div className="player-container-centered" style={{ marginTop: '2rem' }}>
          <YouTubePlayer
            videoId={processedData.videoId}
            onTimeUpdate={setActiveTime}
            seekTrigger={seekTrigger}
            activeSubtitleText={activeSubtitleText}
            isShort={url.toLowerCase().includes('/shorts/')}
            subtitlesLoading={subtitlesLoading}
            lang={lang}
          />

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            marginTop: '1.25rem',
            marginBottom: '0.75rem',
            animation: 'fadeIn 0.3s ease'
          }}>
            <button
              onClick={() => {
                setProcessedData(null);
                setUrl('');
                setError('');
                setSubtitleError('');
                setActiveTime(0);
                setSeekTrigger(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '30px',
                padding: '8px 18px',
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              }}
            >
              <i className="fa-solid fa-arrow-left"></i>
              <span>Back to Home</span>
            </button>

            {!subtitlesLoading && !subtitleError && (
              <button
                onClick={() => {
                  setSeekTrigger({ time: 0, timestamp: Date.now() });
                  setActiveTime(0);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, rgba(0, 188, 212, 0.25), rgba(0, 115, 230, 0.25))',
                  border: '1px solid rgba(0, 188, 212, 0.4)',
                  borderRadius: '30px',
                  padding: '8px 18px',
                  color: '#00bcd4',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(0, 188, 212, 0.1)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 188, 212, 0.35), rgba(0, 115, 230, 0.35))';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 188, 212, 0.25)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 188, 212, 0.25), rgba(0, 115, 230, 0.25))';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 188, 212, 0.1)';
                }}
              >
                <i className="fa-solid fa-rotate-left"></i>
                <span>Replay from Start</span>
              </button>
            )}
          </div>

          {/* Same Language Info Banner & Button (User Request) */}
          {isSameLanguage && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '1.25rem', marginTop: '1.25rem', animation: 'fadeIn 0.3s ease' }}>
              <div className="subtitle-status-banner info" style={{
                width: '100%',
                padding: '1rem 1.5rem',
                background: 'rgba(0, 188, 212, 0.1)',
                border: '1px solid rgba(0, 188, 212, 0.2)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                color: '#00bcd4',
                fontSize: '0.9rem',
                textAlign: 'center'
              }}>
                <i className="fa-solid fa-circle-info" style={{ fontSize: '1.1rem' }}></i>
                <span>
                  This video is already in your selected language ({LANGUAGES.find(l => l.code === lang)?.name || lang}). Therefore, it plays without subtitles.
                </span>
              </div>

              <button
                onClick={() => {
                  setSeekTrigger({ time: activeTime || 0, timestamp: Date.now() });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  background: 'linear-gradient(135deg, #FF0000, #c30000)',
                  border: 'none',
                  borderRadius: '30px',
                  padding: '14px 32px',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 6px 20px rgba(255, 0, 0, 0.25)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(255, 0, 0, 0.4)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, #ff1a1a, #d60000)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 0, 0, 0.25)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, #FF0000, #c30000)';
                }}
              >
                <i className="fa-solid fa-play"></i>
                <span>Play without Subtitles</span>
              </button>
            </div>
          )}

          {/* Subtitle Error / Warning Banner */}
          {subtitleError && (
            <div className="subtitle-status-banner error" style={{
              marginTop: '1.25rem',
              padding: '1rem 1.5rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              color: 'var(--danger)',
              fontSize: '0.9rem'
            }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '1.1rem' }}></i>
              <span>
                Could not fetch subtitles ({subtitleError}). However, you can still watch the video.
              </span>
            </div>
          )}

          {/* Subtitle Success Banner */}
          {!subtitlesLoading && !subtitleError && !isSameLanguage && processedData.subtitles && processedData.subtitles.length > 0 && (
            <div className="subtitle-status-banner success" style={{
              marginTop: '1.25rem',
              padding: '0.75rem 1.5rem',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              color: 'var(--success)',
              fontSize: '0.85rem',
              opacity: 0.9
            }}>
              <i className="fa-solid fa-circle-check" style={{ fontSize: '1rem' }}></i>
              <span>Subtitles are successfully ready! 🎉</span>
            </div>
          )}
        </div>
      )}

      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(10, 10, 12, 0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: 'rgba(25, 25, 30, 0.95)', borderRadius: '24px', width: '100%', maxWidth: '520px', padding: '2.5rem' }}>
            <button onClick={() => setShowSettings(false)} style={{ float: 'right', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            <h2 style={{ marginTop: 0, marginBottom: '2rem', background: 'linear-gradient(135deg, #00bcd4, #0073e6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>App Settings</h2>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>Select Target Language</label>
              <select style={{ width: '100%', padding: '0.85rem', background: '#18181f', color: 'white', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', outline: 'none' }} value={tempLang} onChange={(e) => setTempLang(e.target.value)}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>Subtitle Font Size</label>
              <select style={{ width: '100%', padding: '0.85rem', background: '#18181f', color: 'white', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', outline: 'none' }} value={tempSubtitleSize} onChange={(e) => setTempSubtitleSize(e.target.value)}>
                <option value="xsmall">Extra Small</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="xlarge">Extra Large</option>
              </select>
            </div>

            <button onClick={handleSaveSettings} style={{ width: '100%', padding: '0.9rem', background: 'linear-gradient(135deg, #00bcd4, #0073e6)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Save Settings</button>
          </div>
        </div>
      )}
    </div>
  );
}