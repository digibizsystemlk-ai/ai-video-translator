const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { YoutubeTranscript } = require('youtube-transcript');
const axios = require('axios');
const FormData = require('form-data');
const { ProxyAgent } = require('undici');

dotenv.config();

// Initialize ProxyAgent for global fetch if proxy environment variables are set
let proxyUrl = process.env.PROXY_URL;
if (!proxyUrl && process.env.PROXY_HOST) {
  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT || '80';
  const user = process.env.PROXY_USER;
  const pass = process.env.PROXY_PASS;
  if (user && pass) {
    proxyUrl = `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  } else {
    proxyUrl = `http://${host}:${port}`;
  }
}

let fetchConfig = {};

// 100% Free Browser Emulation Headers (Emulates Chrome on Windows to bypass YouTube Bot Detection)
const EMULATION_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

try {
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : null;
  fetchConfig.fetch = (url, options) => {
    const customHeaders = options && options.headers ? options.headers : {};
    const mergedHeaders = {
      ...EMULATION_HEADERS,
      ...customHeaders
    };
    return fetch(url, {
      ...options,
      headers: mergedHeaders,
      ...(dispatcher ? { dispatcher } : {})
    });
  };
  if (proxyUrl) {
    console.log(`🌐 [Proxy + Emulation] Configured undici ProxyAgent and browser headers for global transcript fetching.`);
  } else {
    console.log(`🌐 [Browser Emulation] Configured global browser spoofing headers for transcript fetching.`);
  }
} catch (err) {
  console.error('❌ [Emulation ERROR] Failed to initialize fetch proxy/headers:', err.message);
}

const app = express();
const PORT = 8080;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// API Keys configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBMexKhvmMj_IpL9MB1iS1Q6tkhaVCDG4Q'; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const isWindows = process.platform === 'win32';

// In Firebase Cloud Functions, the environment filesystem is read-only, except for /tmp.
const ytdlpPath = isWindows ? path.join(__dirname, 'yt-dlp.exe') : '/tmp/yt-dlp';
const YTDLP_URL = isWindows 
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' 
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

// Lightning-Fast Translation Cache System (Persistent Disk Cache)
const READ_ONLY_CACHE_FILE = path.join(__dirname, 'translation_cache.json');
const WRITE_CACHE_FILE = isWindows ? path.join(__dirname, 'translation_cache.json') : '/tmp/translation_cache.json';
let translationCache = {};

// 1. First, load the pre-packaged read-only cache from the bundle directory
try {
  if (fs.existsSync(READ_ONLY_CACHE_FILE)) {
    translationCache = JSON.parse(fs.readFileSync(READ_ONLY_CACHE_FILE, 'utf8'));
    console.log(`[Cache] Loaded ${Object.keys(translationCache).length} pre-packaged cached translations from ${READ_ONLY_CACHE_FILE}`);
  }
} catch (err) {
  console.error('[Cache ERROR] Failed to load pre-packaged translation cache:', err.message);
}

// 2. Second, merge with any writable cache from the temp directory if in production
if (!isWindows) {
  try {
    if (fs.existsSync(WRITE_CACHE_FILE)) {
      const writableCache = JSON.parse(fs.readFileSync(WRITE_CACHE_FILE, 'utf8'));
      translationCache = { ...translationCache, ...writableCache };
      console.log(`[Cache] Merged with writable cache from ${WRITE_CACHE_FILE}. Total entries: ${Object.keys(translationCache).length}`);
    }
  } catch (err) {
    console.error('[Cache ERROR] Failed to load writable translation cache:', err.message);
  }
}

function saveCacheToDisk() {
  try {
    fs.writeFileSync(WRITE_CACHE_FILE, JSON.stringify(translationCache, null, 2), 'utf8');
    console.log(`[Cache] Saved translation cache to ${WRITE_CACHE_FILE}`);
  } catch (err) {
    console.error('[Cache ERROR] Failed to save translation cache:', err.message);
  }
}

// Standalone yt-dlp auto-downloader to make setup plug-and-play
async function ensureYtDlp() {
  if (fs.existsSync(ytdlpPath)) {
    console.log(`✅ yt-dlp is ready at: ${ytdlpPath}`);
    return true;
  }
  console.log(`⏳ Downloading yt-dlp from: ${YTDLP_URL}...`);
  try {
    const res = await fetch(YTDLP_URL);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(ytdlpPath, Buffer.from(buffer));
    
    // On Linux/macOS, we must set executable permissions
    if (!isWindows) {
      fs.chmodSync(ytdlpPath, 0o755);
      console.log('🐧 Set executable permissions (chmod 755) for Linux/Cloud yt-dlp.');
    }
    
    console.log('✅ yt-dlp downloaded and initialized successfully!');
    return true;
  } catch (err) {
    console.error('❌ Failed to download yt-dlp:', err.message);
    return false;
  }
}

function getYouTubeId(url) {
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
}

const downloadAudio = (videoId) => {
  return new Promise((resolve, reject) => {
    const tempDir = isWindows ? path.join(__dirname, 'temp') : '/tmp/media';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Clean existing test files for this video to avoid conflicts
    try {
      fs.readdirSync(tempDir).forEach(f => {
        if (f.startsWith(videoId)) {
          fs.unlinkSync(path.join(tempDir, f));
        }
      });
    } catch (e) {}

    const outputTemplate = path.join(tempDir, `${videoId}.%(ext)s`);
    const args = [
      `https://www.youtube.com/watch?v=${videoId}`,
      '-f', 'ba', // Download the best audio track directly
      '-o', outputTemplate,
      '--no-playlist',
      '--js-runtimes', `node:${process.execPath}`,
      '--sleep-requests', '1' // Small delay between requests to mimic human behavior
    ];

    if (proxyUrl) {
      args.push('--proxy', proxyUrl);
      console.log(`🌐 [yt-dlp Proxy] Routing download through proxy: ${proxyUrl.replace(/:[^:@]+@/, ':****@')}`);
    }

    // Convert cookies.json to Netscape format if it exists, and write to writable location
    const cookiesJsonPath = path.join(__dirname, 'cookies.json');
    let finalCookiesPath = null;
    if (fs.existsSync(cookiesJsonPath)) {
      try {
        const jsonContent = JSON.parse(fs.readFileSync(cookiesJsonPath, 'utf8'));
        let netscapeString = "# Netscape HTTP Cookie File\n# Generated programmatically from cookies.json\n\n";
        const cookiesArray = Array.isArray(jsonContent) ? jsonContent : [jsonContent];
        
        for (const cookie of cookiesArray) {
          if (!cookie.domain || !cookie.name) continue;
          const domain = cookie.domain;
          const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
          const pathVal = cookie.path || '/';
          const secure = cookie.secure ? 'TRUE' : 'FALSE';
          const expiration = cookie.expirationDate ? Math.round(cookie.expirationDate) : Math.round(Date.now() / 1000 + 31536000);
          const name = cookie.name;
          const value = cookie.value || '';
          
          netscapeString += `${domain}\t${flag}\t${pathVal}\t${secure}\t${expiration}\t${name}\t${value}\n`;
        }
        
        const targetCookiesDir = isWindows ? tempDir : '/tmp';
        if (!fs.existsSync(targetCookiesDir)) {
          fs.mkdirSync(targetCookiesDir, { recursive: true });
        }
        const convertedPath = path.join(targetCookiesDir, 'cookies.txt');
        fs.writeFileSync(convertedPath, netscapeString, 'utf8');
        finalCookiesPath = convertedPath;
        console.log(`🍪 Successfully converted JSON cookies to Netscape format at: ${convertedPath}`);
      } catch (err) {
        console.error(`❌ Error parsing/converting cookies.json: ${err.message}`);
      }
    }

    const runYtDlp = (argsList, attemptNoCookies = false) => {
      return new Promise((resolveRun, rejectRun) => {
        const activeArgs = [...argsList];
        if (attemptNoCookies) {
          const cookiesIdx = activeArgs.indexOf('--cookies');
          if (cookiesIdx !== -1) {
            activeArgs.splice(cookiesIdx, 2);
          }
        }
        console.log(`🎬 [yt-dlp] Running download (Attempt: ${attemptNoCookies ? 'WITHOUT COOKIES' : 'WITH COOKIES'})...`);
        execFile(ytdlpPath, activeArgs, (error, stdout, stderr) => {
          if (error) {
            return rejectRun({ error, stderr });
          }
          resolveRun(stdout);
        });
      });
    };

    if (finalCookiesPath && fs.existsSync(finalCookiesPath)) {
      args.push('--cookies', finalCookiesPath);
      console.log(`🍪 Passing Netscape cookies to yt-dlp: ${finalCookiesPath}`);
    }

    runYtDlp(args, false)
      .then(() => {
        const files = fs.readdirSync(tempDir).filter(f => f.startsWith(videoId));
        if (files.length === 0) {
          return reject(new Error('Audio file was not created by yt-dlp.'));
        }
        const filePath = path.join(tempDir, files[0]);
        const ext = path.extname(files[0]).toLowerCase();
        resolve({ filePath, ext });
      })
      .catch(({ error, stderr }) => {
        const hasCookies = args.includes('--cookies');
        if (hasCookies) {
          console.warn(`⚠️ [yt-dlp Warning] Initial attempt with cookies failed. Retrying WITHOUT cookies as fallback...`);
          runYtDlp(args, true)
            .then(() => {
              const files = fs.readdirSync(tempDir).filter(f => f.startsWith(videoId));
              if (files.length === 0) {
                return reject(new Error('Audio file was not created by yt-dlp.'));
              }
              const filePath = path.join(tempDir, files[0]);
              const ext = path.extname(files[0]).toLowerCase();
              resolve({ filePath, ext });
            })
            .catch((retryErr) => {
              reject(new Error(`yt-dlp failed on both attempts. Stderr: ${retryErr.stderr || retryErr.error.message}`));
            });
        } else {
          reject(new Error(`yt-dlp failed: ${error.message}. Stderr: ${stderr}`));
        }
      });
  });
};

/**
 * Merges consecutive short caption segments into longer semantic sentence blocks (max 12 seconds).
 */
function combineCaptions(rawCaptions, maxDuration = 12) {
  if (!rawCaptions || rawCaptions.length === 0) return [];
  
  const combined = [];
  let currentGroup = [];
  let currentStart = rawCaptions[0].start;
  let currentText = "";
  
  for (let i = 0; i < rawCaptions.length; i++) {
    const cap = rawCaptions[i];
    
    if (currentGroup.length === 0) {
      currentStart = cap.start;
      currentText = cap.text;
      currentGroup.push(cap);
    } else {
      currentText += " " + cap.text;
      currentGroup.push(cap);
    }
    
    const currentDuration = cap.end - currentStart;
    const endsWithSentenceBoundary = /[.!?]$/.test(cap.text.trim());
    const isLast = i === rawCaptions.length - 1;
    
    if (currentDuration >= maxDuration || endsWithSentenceBoundary || isLast) {
      combined.push({
        start: currentStart,
        end: cap.end,
        text: currentText.replace(/\s+/g, ' ').trim()
      });
      currentGroup = [];
    }
  }
  
  return combined;
}

/**
 * Completely keyless, free, and unlimited Google Translate API fallback (Super Fast Batch Mode)
 */
async function translateTextFree(texts, targetLang = 'Sinhala') {
  const langCodes = {
    'Sinhala': 'si',
    'English': 'en',
    'Tamil': 'ta',
    'Hindi': 'hi',
    'Spanish': 'es',
    'German': 'de',
    'French': 'fr',
    'Japanese': 'ja',
    'Chinese': 'zh-CN',
    'Arabic': 'ar'
  };
  const tl = langCodes[targetLang] || 'si';
  
  console.log(`[Free Translator] Super Fast Batch translating ${texts.length} segments to lang code: ${tl}...`);
  const translations = [];
  const batchSize = 8; // Safely sized batch to prevent HTTP 400/URL length limits
  let sourceLanguage = 'English';
  let firstBatch = true;
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const joinedText = chunk.join('\n');
    
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(joinedText)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      
      if (firstBatch && data && data[2]) {
        const detectedCode = data[2];
        const langMap = {
          'si': 'Sinhala',
          'en': 'English',
          'ta': 'Tamil',
          'hi': 'Hindi',
          'es': 'Spanish',
          'de': 'German',
          'fr': 'French',
          'ja': 'Japanese',
          'zh-CN': 'Chinese',
          'zh': 'Chinese',
          'ar': 'Arabic'
        };
        sourceLanguage = langMap[detectedCode] || 'English';
        firstBatch = false;
      }
      
      let translatedLines = [];
      if (data && data[0]) {
        const combinedTranslation = data[0].map(x => x[0]).join('');
        translatedLines = combinedTranslation.split('\n').map(line => line.trim());
      }
      
      // Robust split validation
      if (translatedLines.length === chunk.length) {
        translations.push(...translatedLines);
        console.log(`[Free Translator] Translated batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} successfully.`);
      } else {
        console.warn(`[Free Translator Warning] Split mismatch on batch ${Math.floor(i / batchSize) + 1}. Sequential fallback...`);
        for (const line of chunk) {
          try {
            const singleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(line)}`;
            const singleRes = await fetch(singleUrl);
            const singleData = await singleRes.json();
            const translatedSingle = singleData[0].map(x => x[0]).join('').trim();
            translations.push(translatedSingle || line);
          } catch (e) {
            translations.push(line);
          }
          await new Promise(r => setTimeout(r, 20));
        }
      }
    } catch (err) {
      console.error(`[Free Translator Error] Failed batch starting at index ${i}:`, err);
      translations.push(...chunk); // Safe fallback to original
    }
    
    // Tiny delay between small batches to protect rate limits while maintaining ultra-high speed
    await new Promise(r => setTimeout(r, 20));
  }
  return { translations, sourceLanguage };
}

app.post('/api/process', async (req, res) => {
  const urlInput = req.body.url;
  const lang = req.body.lang || 'Sinhala';

  if (!urlInput) return res.status(400).json({ success: false, error: 'YouTube URL එක අවශ්‍යයි.' });
  const videoId = getYouTubeId(urlInput);
  if (!videoId) return res.status(400).json({ success: false, error: 'වලංගු නොවන YouTube සබැඳියකි.' });

  const cacheKey = `${videoId}_${lang}`;
  if (translationCache[cacheKey]) {
    console.log(`[Cache HIT] Returning cached translation instantly for ${cacheKey}`);
    return res.json({
      success: true,
      videoId: videoId,
      method: 'Cached Translation (Instant)',
      language: lang,
      sourceLanguage: translationCache[cacheKey].sourceLanguage || 'English',
      subtitles: translationCache[cacheKey].subtitles
    });
  }

  console.log(`🎬 [Pipeline Engine] Processing Video ID: ${videoId} for target language: ${lang}`);

  let audioPath = null;

  try {
    let rawCaptions = null;
    let methodUsed = 'Native YouTube Captions';

    // Phase 1: Try to fetch native captions
    try {
      console.log(`[Processor] Attempting to fetch native YouTube captions...`);
      const transcriptList = await YoutubeTranscript.fetchTranscript(videoId, {
        ...(fetchConfig.fetch ? { fetch: fetchConfig.fetch } : {})
      });
      
      if (transcriptList && transcriptList.length > 0) {
        rawCaptions = transcriptList
          .map(item => {
            const cleanedText = item.text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
            return {
              start: Number((item.offset / 1000).toFixed(2)),
              end: Number(((item.offset + item.duration) / 1000).toFixed(2)),
              text: cleanedText
            };
          })
          .filter(item => item.text.length > 0);
        console.log(`[Processor] Successfully fetched and cleaned ${rawCaptions.length} native caption segments.`);
      }
    } catch (err) {
      console.log(`[Processor] Native captions fetching failed or not available: ${err.message}`);
    }

    if (rawCaptions) {
      // Native Captions available
      const mergedCaptions = combineCaptions(rawCaptions, 12);
      console.log(`[Processor] Merged ${rawCaptions.length} raw segments into ${mergedCaptions.length} semantic blocks.`);
      const allTexts = mergedCaptions.map(c => c.text);

      let translations = [];
      let sourceLanguage = 'English';
      
      // Attempt A: Translate using Gemini
      try {
        console.log(`🧠 Translating all ${allTexts.length} segments via Gemini...`);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const translatePrompt = `You are a professional video translator.
Translate the following array of video subtitle strings into ${lang} in the exact same 1-to-1 order.
Do not omit any items. Maintain the exact same number of elements in the output list.
Also, detect the primary language of the input subtitles and return it in the "sourceLanguage" field (e.g. "Sinhala", "Tamil", "English", "Spanish", "French", "German", "Japanese", "Chinese", "Hindi", "Arabic").
Input: ${JSON.stringify(allTexts)}
Return response ONLY as a JSON object with this format:
{ "sourceLanguage": "detected_language_name", "translations": ["translated_string_1", "translated_string_2", ...] }`;
        
        const result = await model.generateContent(translatePrompt);
        const responseText = result.response.text();
        const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJsonString);
        translations = parsed.translations || [];
        sourceLanguage = parsed.sourceLanguage || 'English';
      } catch (geminiErr) {
        console.warn(`[Processor Warning] Gemini Translation failed: ${geminiErr.message}. Toggling Free Keyless Translation Fallback!`);
        methodUsed = 'Native Captions + Free Keyless Translation Fallback';
        const freeRes = await translateTextFree(allTexts, lang);
        translations = freeRes.translations;
        sourceLanguage = freeRes.sourceLanguage;
      }

      const subtitles = mergedCaptions.map((cap, idx) => ({
        start: cap.start,
        end: cap.end,
        text: cap.text,
        sinhala: translations[idx] || cap.text
      }));

      translationCache[cacheKey] = { subtitles, sourceLanguage };
      saveCacheToDisk();

      return res.json({
        success: true,
        videoId: videoId,
        method: methodUsed,
        language: lang,
        sourceLanguage,
        subtitles
      });
    }

    // Phase 2: Native captions not available, return client-side fallback instructions to keep IP clean & compliant
    console.log(`[Processor] Captions unavailable. Triggering client-side audio download fallback.`);
    return res.json({
      success: true,
      fallback: 'client_audio_download',
      videoId: videoId,
      language: lang,
      cobaltInstances: [
        'https://api.cobalt.blackcat.sweeux.org',
        'https://fox.kittycat.boo',
        'https://api.dl.woof.monster'
      ]
    });

  } catch (error) {
    console.error('🔥 Backend Error:', error.stack || error.message);
    let errorMsg = 'පරිවර්තනය කිරීමේදී දෝෂයක් සිදුවිය. නැවත උත්සාහ කරන්න.';
    return res.status(500).json({ success: false, error: errorMsg });
  }
});

app.post('/api/process-audio', async (req, res) => {
  const { videoId, lang, audioBase64, mimeType } = req.body;
  if (!videoId || !audioBase64) {
    return res.status(400).json({ success: false, error: 'Video ID and audio data are required.' });
  }

  const cacheKey = `${videoId}_${lang}`;
  if (translationCache[cacheKey]) {
    console.log(`[Cache HIT] Returning cached translation instantly for ${cacheKey}`);
    return res.json({
      success: true,
      videoId: videoId,
      method: 'Cached Translation (Instant)',
      language: lang,
      sourceLanguage: translationCache[cacheKey].sourceLanguage || 'English',
      subtitles: translationCache[cacheKey].subtitles
    });
  }

  const tempDir = isWindows ? path.join(__dirname, 'temp') : '/tmp/media';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const audioPath = path.join(tempDir, `${videoId}.mp3`);
  let methodUsed = 'Client-Side Audio Upload + Gemini Multimodal';
  let sourceLanguage = 'English';

  try {
    // Write base64 audio to file
    console.log(`📥 Received Base64 audio for Video ID: ${videoId}. Writing to disk...`);
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    fs.writeFileSync(audioPath, audioBuffer);
    console.log(`💾 Saved temp audio file to ${audioPath} (${audioBuffer.length} bytes)`);

    let subtitles = [];
    let geminiSuccess = false;

    // Attempt A: Try Gemini Multimodal (using gemini-1.5-pro as primary, fallback to gemini-2.0-flash)
    const geminiModels = ['gemini-1.5-pro', 'gemini-2.0-flash'];
    for (const modelName of geminiModels) {
      try {
        console.log(`🧠 Sending audio data to Google Gemini (${modelName})...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `Listen to this audio track extremely carefully. 
Generate highly accurate subtitles in ${lang} language with precise start and end timestamps.
Also, detect the primary language of the spoken audio and return it in the "sourceLanguage" field (e.g. "Sinhala", "Tamil", "English", "Spanish", "French", "German", "Japanese", "Chinese", "Hindi", "Arabic").
You must return the response ONLY as a valid and clean JSON object matching the format below:
{
  "sourceLanguage": "detected_language_name",
  "subtitles": [
    { "start": 0.0, "end": 4.2, "text": "English original text line here", "sinhala": "නිවැරදි සිංහල පරිවර්තනය මෙතන" }
  ]
}`;

        const result = await model.generateContent([
          { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
          prompt
        ]);

        const responseText = result.response.text();
        const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const resultData = JSON.parse(cleanJsonString);
        subtitles = resultData.subtitles || [];
        sourceLanguage = resultData.sourceLanguage || 'English';
        if (subtitles.length > 0) {
          geminiSuccess = true;
          console.log(`✅ Gemini Multimodal processing (${modelName}) succeeded with ${subtitles.length} segments.`);
          break;
        }
      } catch (geminiErr) {
        console.warn(`[Processor Warning] Gemini Multimodal (${modelName}) failed: ${geminiErr.message}`);
      }
    }

    // Attempt B: Groq Whisper + Free Translation Fallback
    if (!geminiSuccess) {
      methodUsed = 'Client-Side Audio Upload + Groq Whisper + Free Translation';
      console.log(`🚀 Initiating Groq Whisper audio transcription...`);
      
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('Groq API Key is not set in .env file.');
      }

      const form = new FormData();
      form.append('file', fs.createReadStream(audioPath));
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'verbose_json');

      const whisperRes = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${apiKey}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      const segments = whisperRes.data.segments || [];
      const whisperLang = whisperRes.data.language || 'english';
      
      // Capitalize first letter of whisperLang
      const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
      sourceLanguage = capitalize(whisperLang);
      
      console.log(`✅ Groq Whisper transcribed ${segments.length} segments in language ${sourceLanguage}.`);

      if (segments.length === 0) {
        throw new Error('Whisper transcribed 0 segments.');
      }

      // Convert and merge Whisper segments
      const rawSegments = segments.map(s => ({
        start: Number(s.start.toFixed(2)),
        end: Number(s.end.toFixed(2)),
        text: s.text.trim()
      }));

      const mergedSegments = combineCaptions(rawSegments, 12);
      console.log(`[Processor] Merged ${rawSegments.length} Whisper segments into ${mergedSegments.length} semantic blocks.`);

      const allTexts = mergedSegments.map(s => s.text);
      console.log(`[Processor] Translating transcribed text segments to ${lang}...`);
      const freeRes = await translateTextFree(allTexts, lang);
      const translations = freeRes.translations;

      subtitles = mergedSegments.map((s, idx) => ({
        start: s.start,
        end: s.end,
        text: s.text,
        sinhala: translations[idx] || s.text
      }));
    }

    // Clean up temporary audio file from disk
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`🧹 Cleaned up temporary audio file: ${audioPath}`);
      }
    } catch (e) {
      console.error(`Failed to clean up temporary file: ${e.message}`);
    }

    translationCache[cacheKey] = { subtitles, sourceLanguage };
    saveCacheToDisk();

    return res.json({
      success: true,
      videoId: videoId,
      method: methodUsed,
      language: lang,
      sourceLanguage,
      subtitles
    });

  } catch (error) {
    console.error('🔥 Backend Process Audio Error:', error.stack || error.message);
    
    // Clean up temporary audio file if error occurs
    if (fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
      } catch (e) {}
    }

    return res.status(500).json({ success: false, error: 'පරිවර්තනය කිරීමේදී දෝෂයක් සිදුවිය. නැවත උත්සාහ කරන්න.' });
  }
});

// Export for Firebase Cloud Functions v2
const { onRequest } = require('firebase-functions/v2/https');
exports.translator = onRequest({ cors: true, timeoutSeconds: 300, memory: '1GiB' }, app);

// Only listen directly if run locally (not as a Firebase Cloud Function)
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Standalone Backend running on port ${PORT}`);
    ensureYtDlp().catch(err => console.error('Failed to pre-download yt-dlp:', err.message));
  });
} else {
  // If running inside Firebase Functions, pre-initialize yt-dlp on container startup
  ensureYtDlp().catch(err => console.error('Failed to pre-download yt-dlp:', err.message));
}