import React, { useState, useEffect, useRef } from 'react';
import YouTubePlayer from './components/YouTubePlayer';

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
  { code: 'Arabic', name: 'العربية (Arabic)' },
  { code: 'Portuguese', name: 'Português (Portuguese)' },
  { code: 'Russian', name: 'Русский (Russian)' },
  { code: 'Italian', name: 'Italiano (Italian)' },
  { code: 'Korean', name: '한국어 (Korean)' },
  { code: 'Turkish', name: 'Türkçe (Turkish)' },
  { code: 'Dutch', name: 'Nederlands (Dutch)' },
  { code: 'Swedish', name: 'Svenska (Swedish)' },
  { code: 'Polish', name: 'Polski (Polish)' },
  { code: 'Norwegian', name: 'Norsk (Norwegian)' },
  { code: 'Finnish', name: 'Suomi (Finnish)' },
  { code: 'Danish', name: 'Dansk (Danish)' },
  { code: 'Vietnamese', name: 'Tiếng Việt (Vietnamese)' },
  { code: 'Indonesian', name: 'Bahasa Indonesia (Indonesian)' },
  { code: 'Thai', name: 'ไทย (Thai)' },
  { code: 'Greek', name: 'Ελληνικά (Greek)' },
  { code: 'Hebrew', name: 'עברית (Hebrew)' }
];

// Helper to convert seconds to user-friendly format 00:00
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Safe, lightweight vanilla Markdown renderer
const renderMarkdown = (text) => {
  if (!text) return '';
  
  // Convert standard markdown to safe HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Headers (h3, h2, h1)
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Blockquotes
  html = html.replace(/^&gt;\s+(.*?)$/gm, '<blockquote>$1</blockquote>');
  
  // Lists
  let inList = false;
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    const listMatch = line.match(/^[\-\*]\s+(.*)$/);
    if (listMatch) {
      const content = `<li>${listMatch[1]}</li>`;
      if (!inList) {
        inList = true;
        return `<ul>${content}`;
      }
      return content;
    } else {
      if (inList) {
        inList = false;
        return `</ul>${line}`;
      }
      return line;
    }
  });
  if (inList) {
    processedLines.push('</ul>');
  }
  html = processedLines.join('\n');
  
  // Paragraphs
  const blocks = html.split(/\n\s*\n/);
  const formattedBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<blockquote') || trimmed.startsWith('</ul')) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
  });
  
  return formattedBlocks.join('\n');
};

const uiTranslations = {
  Sinhala: {
    appTitle: "YT වීඩියෝ පරිවර්තකය",
    appSubtitle: "",
    inputLabel: "YouTube වීඩියෝ ලින්ක් එක",
    inputPlaceholder: "YouTube වීඩියෝ ලින්ක් එක මෙතැනට ඇතුළත් කරන්න...",
    langLabel: "තෝරාගන්නා භාෂාව",
    btnTranslate: "පරිවර්තනය සහ සාරාංශය",
    btnProcessing: "පරිවර්තනය වෙමින් පවතී...",
    errorTitle: "පරිවර්තනය කිරීමේ දෝෂයකි:",
    loadingTitle: "වීඩියෝව විශ්ලේෂණය කරමින් පවතී",
    loadingText: (seconds) => `තව තත්පර ${seconds} කින් සූදානම් වේ. රැඳී සිටින්න...`,
    readyTitle: "පරිවර්තනය සඳහා සූදානම්",
    readyText: "ඉහතින් YouTube ලින්ක් එකක් ලබා දී, පරිවර්තනය කළ යුතු භාෂාව තෝරාගන්න.",
    tabSummary: "AI සාරාංශය",
    tabTranscript: "ලිඛිත පිටපත (Interactive Transcript)",
    method: "ක්‍රමය",
    language: "භාෂාව",
    emptySubtitles: "මෙම වීඩියෝ කොටස සඳහා උපසිරසි ජනනය වී නොමැත."
  },
  English: {
    appTitle: "YT Video Translator",
    appSubtitle: "",
    inputLabel: "YouTube Video Link",
    inputPlaceholder: "https://www.youtube.com/watch?v=...",
    langLabel: "Target Language",
    btnTranslate: "Translate & Summarize",
    btnProcessing: "Processing...",
    errorTitle: "Error Processing Request:",
    loadingTitle: "Analyzing the video",
    loadingText: (seconds) => `Ready in about ${seconds} seconds. Please wait...`,
    readyTitle: "Ready for Translation",
    readyText: "Paste a YouTube link above and choose a target translation language.",
    tabSummary: "AI Structured Summary",
    tabTranscript: "Interactive Transcript",
    method: "Method",
    language: "Language",
    emptySubtitles: "No subtitle transcripts generated for this audio segment."
  }
};
// Centralized production backend API URL. Leave as empty string for relative paths, or set your Firebase URL (e.g., https://your-project.web.app).
const DEFAULT_PRODUCTION_API_URL = 'https://digibiz-apps.web.app';

export default function App() {
  const [url, setUrl] = useState('');
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('yt_translator_default_lang') || 'Sinhala';
  });
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState('');
  const [processedData, setProcessedData] = useState(null);
  const [activeTime, setActiveTime] = useState(0);
  const [seekTrigger, setSeekTrigger] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  
  // Settings & Feedback states
  const [showSettings, setShowSettings] = useState(false);
  const [tempLang, setTempLang] = useState(lang);
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const [subtitleSize, setSubtitleSize] = useState(() => {
    return localStorage.getItem('yt_translator_subtitle_size') || 'medium';
  });
  const [tempSubtitleSize, setTempSubtitleSize] = useState(subtitleSize);

  const [apiBase, setApiBase] = useState(() => {
    return localStorage.getItem('yt_translator_api_base') || DEFAULT_PRODUCTION_API_URL;
  });
  const [tempApiBase, setTempApiBase] = useState(apiBase);

  const handleSaveSettings = () => {
    localStorage.setItem('yt_translator_default_lang', tempLang);
    localStorage.setItem('yt_translator_subtitle_size', tempSubtitleSize);
    localStorage.setItem('yt_translator_api_base', tempApiBase);
    setLang(tempLang);
    setSubtitleSize(tempSubtitleSize);
    setApiBase(tempApiBase);
    setShowSettings(false);
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackMsg.trim()) return;

    setFeedbackSubmitting(true);
    setFeedbackError('');
    setFeedbackSuccess(false);

    try {
      const response = await fetch(`${apiBase}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: feedbackName,
          email: feedbackEmail,
          message: feedbackMsg
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save suggestion to backend.');
      }

      setFeedbackSuccess(true);
      setFeedbackName('');
      setFeedbackEmail('');
      setFeedbackMsg('');

      // Directly trigger native mail client for maximum convenience
      const mailtoUrl = `mailto:biz.sirimal@gmail.com?subject=YT%20Translator%20Feedback&body=Name:%20${encodeURIComponent(feedbackName || 'Anonymous')}%0AEmail:%20${encodeURIComponent(feedbackEmail || 'None')}%0AMessage:%20${encodeURIComponent(feedbackMsg)}`;
      window.open(mailtoUrl, '_blank');

    } catch (err) {
      console.error(err);
      setFeedbackError(err.message || 'Failed to submit suggestion.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };
  
  const transcriptContainerRef = useRef(null);

  // Get active translation dictionary driven by selected dropdown language
  const t = uiTranslations[lang] || uiTranslations.English;

  // PWA Share Target Handler: capture shared YouTube link from native share sheet
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text') || params.get('title');
    if (sharedUrl) {
      console.log(`[PWA Share Target] Shared data received: ${sharedUrl}`);
      const youtubeRegex = /(https?:\/\/[^\s]+)/;
      const match = sharedUrl.match(youtubeRegex);
      if (match && match[0]) {
        setUrl(match[0]);
      }
    }
  }, []);

  // Derive the active subtitle index
  let activeSubtitleIndex = -1;
  let activeSubtitleText = '';
  
  if (processedData && processedData.subtitles) {
    activeSubtitleIndex = processedData.subtitles.findIndex(
      (sub) => activeTime >= sub.start && activeTime <= sub.end
    );

    // Fallback: If no exact segment match, find the closest previous segment
    if (activeSubtitleIndex === -1 && processedData.subtitles.length > 0) {
      for (let i = processedData.subtitles.length - 1; i >= 0; i--) {
        if (activeTime >= processedData.subtitles[i].start) {
          activeSubtitleIndex = i;
          break;
        }
      }
    }

    if (activeSubtitleIndex !== -1) {
      activeSubtitleText = processedData.subtitles[activeSubtitleIndex].text;
    }
  }

  // Auto-scroll subtitle list when activeSubtitleIndex changes
  useEffect(() => {
    if (activeSubtitleIndex !== -1 && activeTab === 'subtitles') {
      const activeElement = document.getElementById(`sub-item-${activeSubtitleIndex}`);
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [activeSubtitleIndex, activeTab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setProcessedData(null);
    setActiveTime(0);
    setSeekTrigger(null);
    setActiveTab('summary');
    setCountdown(5);
    
    // Start countdown timer ticking down every second
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 1;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const response = await fetch(`${apiBase}/api/process?url=${encodeURIComponent(url)}&lang=${lang}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process YouTube video. Please try a different URL.');
      }

      if (!localStorage.getItem('yt_translator_subtitle_size')) {
        const isShort = url.toLowerCase().includes('/shorts/');
        const defaultSize = isShort ? 'small' : 'xsmall';
        setSubtitleSize(defaultSize);
        setTempSubtitleSize(defaultSize);
      }
      setProcessedData(data);
      setActiveTab('summary');
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred while communicating with the translation server.');
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  };

  const handleSubtitleClick = (subtitle, index) => {
    setSeekTrigger({
      time: subtitle.start,
      timestamp: Date.now()
    });
    setActiveTime(subtitle.start);
  };

  const sizeMultipliers = {
    xsmall: '0.55',
    small: '0.75',
    medium: '1.0',
    large: '1.25',
    xlarge: '1.55'
  };

  return (
    <div className={`app-container ${processedData ? 'has-video' : ''}`} style={{ '--subtitle-scale': sizeMultipliers[subtitleSize] || '1.0' }}>
      {/* Sleek Compact Header */}
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div className="app-logo">
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
            setFeedbackSuccess(false);
            setFeedbackError('');
          }}
          title="Settings & Suggestions"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: 'var(--text-primary)',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
        >
          <i className="fa-solid fa-gear" style={{ fontSize: '1.2rem', color: 'var(--accent-blue)' }}></i>
        </button>
      </header>

      {/* Input Card Form */}
      <div className="input-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group-row">
            <div className="form-field">
              <label className="form-label" htmlFor="yt-url">
                <i className="fa-brands fa-youtube" style={{ color: 'var(--danger)', marginRight: '0.4rem' }}></i>
                {t.inputLabel}
              </label>
              <input
                id="yt-url"
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
              {loading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  <span>{t.btnProcessing}</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-circle-play"></i>
                  <span>{t.btnTranslate}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>{t.errorTitle}</strong> {error}
          </div>
        </div>
      )}

      {/* Loading Overlay State */}
      {loading && (
        <div className="input-card" style={{ padding: '4.5rem 2rem', textAlign: 'center' }}>
          <div className="loading-wrapper" style={{ padding: 0 }}>
            <div className="loading-spinner-container">
              <div className="loading-spinner"></div>
              <div className="loading-countdown-number">{countdown}</div>
            </div>
            <h3 className="loading-title" style={{ marginTop: '1.5rem', color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: '600' }}>
              {t.loadingTitle}
            </h3>
            <p className="loading-text" style={{ margin: '0.8rem auto 0 auto', maxWidth: '500px', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
              {t.loadingText(countdown)}
            </p>
            <div className="loading-progress-bar-container" style={{ width: '100%', maxWidth: '400px', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px', margin: '2rem auto 0 auto', overflow: 'hidden', position: 'relative' }}>
              <div className="loading-progress-bar-fill" style={{ width: `${((30 - countdown) / 30) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))', borderRadius: '10px', transition: 'width 1s linear' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State Prompt */}
      {!loading && !processedData && !error && (
        <div className="input-card" style={{ padding: '5rem 2rem' }}>
          <div className="empty-state">
            <i className="fa-solid fa-microphone-lines"></i>
            <h3>{t.readyTitle}</h3>
            <p style={{ maxWidth: '450px', margin: '0 auto', color: 'var(--text-secondary)' }}>
              {t.readyText}
            </p>
          </div>
        </div>
      )}

      {/* Dashboard Result Block */}
      {processedData && (
        <div className="player-container-centered">
          {/* Embedded Official YouTube Player with Direct Caption Overlay */}
          <YouTubePlayer
            videoId={processedData.videoId}
            onTimeUpdate={setActiveTime}
            seekTrigger={seekTrigger}
            activeSubtitleText={activeSubtitleText}
            isShort={url.toLowerCase().includes('/shorts/')}
          />

          {/* Method Badge Indicator */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            <span>{t.method}: <strong>{processedData.method}</strong></span>
            <span>•</span>
            <span>{t.language}: <strong>Original ➔ {processedData.language}</strong></span>
          </div>
        </div>
      )}

      {/* Premium Glassmorphic Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(10, 10, 12, 0.75)',
          backdropFilter: 'blur(15px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '1rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'rgba(25, 25, 30, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '520px',
            padding: '2.5rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            color: 'var(--text-primary)',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            {/* Close Button */}
            <button 
              onClick={() => setShowSettings(false)}
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: 'var(--text-secondary)',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <i className="fa-solid fa-xmark" style={{ fontSize: '1.2rem' }}></i>
            </button>

            <h2 style={{ fontSize: '1.6rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              <i className="fa-solid fa-gear" style={{ color: 'var(--accent-blue)' }}></i>
              App Settings
            </h2>

            {/* Language Setting */}
            <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Language Selection */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                  <i className="fa-solid fa-language" style={{ color: 'var(--accent-purple)', marginRight: '0.5rem' }}></i>
                  {tempLang === 'Sinhala' ? 'Default Target Language (පරිවර්තන භාෂාව)' : 'Default Target Language'}
                </label>
                <select
                  value={tempLang}
                  onChange={(e) => setTempLang(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.9rem 1.2rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} style={{ background: '#1c1c24', color: '#fff' }}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subtitle Font Size Selection */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                  <i className="fa-solid fa-text-height" style={{ color: 'var(--accent-blue)', marginRight: '0.5rem' }}></i>
                  {tempLang === 'Sinhala' ? 'Subtitle Font Size (උපසිරසි අකුරු ප්‍රමාණය)' : 'Subtitle Font Size'}
                </label>
                <select
                  value={tempSubtitleSize}
                  onChange={(e) => setTempSubtitleSize(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.9rem 1.2rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="xsmall" style={{ background: '#1c1c24', color: '#fff' }}>{tempLang === 'Sinhala' ? 'Extra Small (ඉතා කුඩා)' : 'Extra Small'}</option>
                  <option value="small" style={{ background: '#1c1c24', color: '#fff' }}>{tempLang === 'Sinhala' ? 'Small (කුඩා)' : 'Small'}</option>
                  <option value="medium" style={{ background: '#1c1c24', color: '#fff' }}>{tempLang === 'Sinhala' ? 'Medium (සාමාන්‍ය)' : 'Medium'}</option>
                  <option value="large" style={{ background: '#1c1c24', color: '#fff' }}>{tempLang === 'Sinhala' ? 'Large (විශාල)' : 'Large'}</option>
                  <option value="xlarge" style={{ background: '#1c1c24', color: '#fff' }}>{tempLang === 'Sinhala' ? 'Extra Large (ඉතා විශාල)' : 'Extra Large'}</option>
                </select>
              </div>


              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: '1.4' }}>
                * Saved settings will persist. We'll automatically translate all future videos and apply your selected settings.
              </p>
              
              <button 
                onClick={handleSaveSettings}
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                  border: 'none',
                  color: 'white',
                  padding: '0.9rem',
                  borderRadius: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0, 115, 230, 0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
              >
                Save Settings
              </button>
            </div>

            {/* Suggestions & Feedback Section */}
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-comments" style={{ color: 'var(--success)' }}></i>
                Suggestions & Ideas
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
                Have suggestions or encountered an issue? Submit your ideas here and they will be directly sent to <strong>biz.sirimal@gmail.com</strong>.
              </p>

              {feedbackSuccess ? (
                <div style={{
                  background: 'rgba(40, 167, 69, 0.1)',
                  border: '1px solid rgba(40, 167, 69, 0.2)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  color: 'var(--success)',
                  textAlign: 'center',
                  fontSize: '0.9rem',
                  marginBottom: '1rem'
                }}>
                  <i className="fa-solid fa-circle-check" style={{ fontSize: '1.8rem', marginBottom: '0.5rem', display: 'block', color: 'var(--success)' }}></i>
                  Thank you! Your feedback has been saved and sent.
                </div>
              ) : (
                <form onSubmit={handleFeedbackSubmit}>
                  {feedbackError && (
                    <div style={{
                      background: 'rgba(220, 53, 69, 0.1)',
                      border: '1px solid rgba(220, 53, 69, 0.2)',
                      borderRadius: '12px',
                      padding: '0.75rem',
                      color: 'var(--danger)',
                      fontSize: '0.8rem',
                      marginBottom: '1rem'
                    }}>
                      {feedbackError}
                    </div>
                  )}

                  <div style={{ marginBottom: '1rem' }}>
                    <input
                      type="text"
                      placeholder="Your Name (Optional)"
                      value={feedbackName}
                      onChange={(e) => setFeedbackName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.8rem 1rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <input
                      type="email"
                      placeholder="Your Email (Optional)"
                      value={feedbackEmail}
                      onChange={(e) => setFeedbackEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.8rem 1rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <textarea
                      placeholder="Enter your suggestion, request, or comments..."
                      value={feedbackMsg}
                      onChange={(e) => setFeedbackMsg(e.target.value)}
                      required
                      rows="4"
                      style={{
                        width: '100%',
                        padding: '0.8rem 1rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        outline: 'none',
                        resize: 'none',
                        lineHeight: '1.4'
                      }}
                    ></textarea>
                  </div>

                  <button 
                    type="submit"
                    disabled={feedbackSubmitting}
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: 'var(--text-primary)',
                      padding: '0.85rem',
                      borderRadius: '10px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                  >
                    {feedbackSubmitting ? (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin"></i>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-paper-plane"></i>
                        <span>Submit Idea & Send Email</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
