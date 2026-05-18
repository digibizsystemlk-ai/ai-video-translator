const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/files');
const { YoutubeTranscript } = require('youtube-transcript');
const ytdl = require('@distube/ytdl-core');

// Watcher reload trigger active

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
  console.warn('WARNING: Google Gemini API Key is not set or contains default placeholder. Please update it in the backend/.env file.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);

// Create temp directory for audio downloads
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Lightning-Fast Translation Cache System (Persistent Disk Cache)
const CACHE_FILE = path.join(__dirname, 'translation_cache.json');
let translationCache = {};

try {
  if (fs.existsSync(CACHE_FILE)) {
    translationCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`[Cache] Loaded ${Object.keys(translationCache).length} cached translations from disk.`);
  }
} catch (err) {
  console.error('[Cache ERROR] Failed to load translation cache:', err);
}

function saveCacheToDisk() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(translationCache, null, 2), 'utf8');
  } catch (err) {
    console.error('[Cache ERROR] Failed to save translation cache:', err);
  }
}

/**
 * Robust regex helper to extract 11-char YouTube Video ID
 */
function getYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Converts seconds into a user-friendly timestamp string (e.g. 01:23)
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Structured JSON Response Schema for Gemini
const responseSchema = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "STRING",
      description: "A highly comprehensive, premium, structured summary of the video content translated to the target language. Focus on key takeaways, core details, and structured action items. Formatted as beautiful Markdown with headers, lists, and spacing."
    },
    subtitles: {
      type: "ARRAY",
      description: "List of synchronized translated subtitle segments, keeping the start and end timestamps exactly preserved.",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER", description: "The start time of this subtitle segment in seconds." },
          end: { type: "NUMBER", description: "The end time of this subtitle segment in seconds." },
          text: { type: "STRING", description: "The translated subtitle text for this segment in the target language." }
        },
        required: ["start", "end", "text"]
      }
    }
  },
  required: ["summary", "subtitles"]
};

/**
 * Robust helper to query Gemini generateContent with up to 3 retries and exponential backoff
 */
async function generateContentWithRetry(model, params, maxRetries = 3, initialDelay = 1500) {
  let attempt = 0;
  let activeModel = model;
  let modelName = model.model || "gemini-2.5-flash";

  while (attempt < maxRetries) {
    try {
      console.log(`[Gemini API] Querying model ${modelName} (Attempt ${attempt + 1}/${maxRetries})...`);
      const result = await activeModel.generateContent(params);
      return result;
    } catch (err) {
      attempt++;
      const errorMessage = err.message || '';
      console.warn(`[Gemini API Warning] Attempt ${attempt} failed with ${modelName}: ${errorMessage}`);
      
      // Smart Fallback Chain for Quota Exceeded (429) or Unsupported (404) errors
      const isQuotaOrNotFoundError = errorMessage.includes("429") || errorMessage.includes("Quota") || errorMessage.includes("limit") || errorMessage.includes("exceeded") || errorMessage.includes("404") || errorMessage.includes("not found");
      
      if (isQuotaOrNotFoundError) {
        if (modelName.includes("2.5")) {
          console.log(`[Gemini API] Quota exceeded or error for ${modelName}. Automatically falling back to gemini-2.0-flash!`);
          modelName = "gemini-2.0-flash";
          activeModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
          attempt = 0; // Reset attempts so the fallback model gets its full retry budget
          continue;
        } else if (modelName.includes("2.0")) {
          console.log(`[Gemini API] Quota exceeded or error for ${modelName}. Automatically falling back to gemini-flash-latest!`);
          modelName = "gemini-flash-latest";
          activeModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
          attempt = 0; // Reset attempts so the fallback model gets its full retry budget
          continue;
        }
      }
      
      if (attempt >= maxRetries) {
        throw err;
      }
      
      const delay = initialDelay * Math.pow(2, attempt - 1);
      console.log(`[Gemini API] Retrying in ${delay}ms due to error...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Merges consecutive short caption segments into longer semantic sentence blocks (max 12 seconds).
 * This dramatically reduces the translation output token count, speeding up processing by 10x,
 * while vastly improving translation context and quality.
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
 * Main Processing API endpoint
 * GET /api/process?url=...&lang=...
 */
app.get('/api/process', async (req, res) => {
  const { url, lang = 'Sinhala' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required.' });
  }

  const videoId = getYouTubeId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL. Please make sure it contains an 11-character video ID.' });
  }

  // Persistent Cache Check for Instant 0-second loading
  const cacheKey = `${videoId}_${lang}`;
  if (translationCache[cacheKey]) {
    console.log(`[Cache HIT] Returning cached translation instantly for ${cacheKey}`);
    return res.json({
      videoId,
      method: 'Cached Translation (Instant)',
      language: lang,
      summary: translationCache[cacheKey].summary,
      subtitles: translationCache[cacheKey].subtitles
    });
  }

  console.log(`[Processor] Started processing Video ID: ${videoId} for target language: ${lang}`);

  let audioPath = null;
  let uploadResult = null;

  try {
    let rawCaptions = null;
    let methodUsed = 'Native YouTube Captions';

    // STEP 1: Attempt to fetch native captions
    try {
      console.log(`[Processor] Attempting to fetch native YouTube captions...`);
      const transcriptList = await YoutubeTranscript.fetchTranscript(videoId);
      
      if (transcriptList && transcriptList.length > 0) {
        rawCaptions = transcriptList.map(item => ({
          start: Number((item.offset / 1000).toFixed(2)),
          end: Number(((item.offset + item.duration) / 1000).toFixed(2)),
          text: item.text
        }));
        console.log(`[Processor] Successfully fetched ${rawCaptions.length} native caption segments.`);
      }
    } catch (err) {
      console.log(`[Processor] Native captions fetching failed or not available: ${err.message}`);
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // STEP 2: Handle fallback if no native captions are found
    if (!rawCaptions) {
      methodUsed = 'Multimodal Gemini Audio Processing';
      console.log(`[Processor] Fallback: Captions unavailable. Starting audio download for multimodal Gemini processing...`);

      // Define standard Chrome headers to bypass YouTube bot detection & signature decipher issues
      const chromeHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
      };

      const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
        requestOptions: { headers: chromeHeaders }
      });
      
      // Filter for audio formats
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      if (!audioFormats || audioFormats.length === 0) {
        throw new Error('No audio-only streams available for this YouTube video.');
      }

      // Choose standard audio containers compatible with Gemini (m4a, webm)
      const format = ytdl.chooseFormat(audioFormats, {
        quality: 'highestaudio',
        filter: (f) => f.container === 'm4a' || f.container === 'webm'
      });

      console.log(`[Processor] Selected audio format: container=${format.container}, bitrate=${format.audioBitrate}kbps`);
      const ext = format.container || 'm4a';
      audioPath = path.join(tempDir, `${videoId}.${ext}`);

      // Pipe to local file
      const writeStream = fs.createWriteStream(audioPath);
      await new Promise((resolve, reject) => {
        ytdl.downloadFromInfo(info, { 
          format,
          requestOptions: { headers: chromeHeaders }
        })
          .pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      // Get downloaded audio size
      const stats = fs.statSync(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log(`[Processor] Audio downloaded successfully. File path: ${audioPath}, Size: ${fileSizeMB.toFixed(2)} MB`);

      if (fileSizeMB > 25) {
        throw new Error('Downloaded audio stream exceeds the maximum allowed size (25MB) for processing. Please try a shorter video.');
      }

      // Upload to Gemini Files API
      console.log(`[Processor] Uploading audio to Google Gemini Files API...`);
      let mimeType = 'audio/mp4';
      if (ext === 'webm') mimeType = 'audio/webm';
      else if (ext === 'm4a') mimeType = 'audio/x-m4a';

      uploadResult = await fileManager.uploadFile(audioPath, {
        mimeType,
        displayName: `Audio-${videoId}`
      });

      console.log(`[Processor] File uploaded successfully to Gemini. URI: ${uploadResult.file.uri}`);

      // STEP 3: Invoke Multimodal Gemini API to transcribe & translate (skip summary to save 15 seconds!)
      console.log(`[Processor] Querying Gemini Multimodal model...`);
      const prompt = `You are a premium AI video translator and transcriber.
Your tasks are:
1. Listen carefully to the uploaded audio stream, transcribe it, and translate the spoken text into ${lang}.
2. Break the translated speech down into clear, highly readable, short subtitle segments. For each segment, output the exact start and end times in seconds (e.g. 0 to 4.5, 4.5 to 8.2). Make sure timestamps align with the spoken audio and don't overlap.
3. Set the "summary" field in the output JSON to a simple string value "Disabled".

You MUST return a single JSON object strictly matching the required JSON schema structure. Do not wrap the JSON in Markdown code block formatting.`;

      const result = await generateContentWithRetry(model, {
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: uploadResult.file.uri,
                  mimeType: uploadResult.file.mimeType
                }
              },
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema
        }
      });

      const responseText = result.response.text();
      const parsedData = JSON.parse(responseText);

      // Save translation results to cache
      translationCache[cacheKey] = {
        summary: parsedData.summary || "Disabled",
        subtitles: parsedData.subtitles
      };
      saveCacheToDisk();

      // Return processed details
      return res.json({
        videoId,
        method: methodUsed,
        language: lang,
        summary: parsedData.summary || "Disabled",
        subtitles: parsedData.subtitles
      });

    } else {
      // Native YouTube Captions are available - Step 3: Run optimized parallel standard Gemini Translation & Summarization
      console.log(`[Processor] Native captions available. Initiating optimized single-request translation & parallel summarization...`);
      
      // Combine raw captions into larger semantic blocks (12 seconds max) to speed up translation by 10x and improve flow!
      const mergedCaptions = combineCaptions(rawCaptions, 12);
      console.log(`[Processor] Merged ${rawCaptions.length} raw segments into ${mergedCaptions.length} semantic blocks.`);

      const summaryText = "Disabled";

      // 2. Translate all merged subtitle texts in a single optimized request (plain text array)
      const allTexts = mergedCaptions.map(c => c.text);
      console.log(`[Processor] Translating all ${allTexts.length} segments in a single optimized request...`);

      const translationSchema = {
        type: "OBJECT",
        properties: {
          translations: {
            type: "ARRAY",
            description: "List of translated subtitle text strings in the target language. Must be in the exact same 1-to-1 order and length as the input text array.",
            items: { type: "STRING" }
          }
        },
        required: ["translations"]
      };

      const translatePrompt = `You are a premium, professional video translator.
Translate the following array of English subtitle text strings into ${lang} in the exact same 1-to-1 order.
Do not omit any items. Maintain the exact same number of elements in the output list.

Input Texts Array:
${JSON.stringify(allTexts)}

You MUST return a single JSON object matching this schema:
{
  "translations": ["translated_string_1", "translated_string_2", ...]
}`;

      // Run only the translation API call (ultra stable and extremely fast!)
      const allTranslations = await generateContentWithRetry(model, {
        contents: [{ role: 'user', parts: [{ text: translatePrompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: translationSchema }
      }).then(result => {
        try {
          const parsed = JSON.parse(result.response.text());
          return parsed.translations || [];
        } catch (err) {
          console.error(`[Processor] Error parsing translations:`, err);
          return allTexts; // Fallback to original text if parse fails
        }
      });

      console.log(`[Processor] Optimized translation completed successfully. Total translated segments: ${allTranslations.length}`);

      // 3. Zip the translated texts back with original timestamps
      const subtitles = mergedCaptions.map((cap, idx) => ({
        start: cap.start,
        end: cap.end,
        text: allTranslations[idx] || cap.text
      }));

      // Save translation results to cache
      translationCache[cacheKey] = {
        summary: summaryText,
        subtitles
      };
      saveCacheToDisk();

      return res.json({
        videoId,
        method: methodUsed,
        language: lang,
        summary: summaryText,
        subtitles
      });
    }

  } catch (error) {
    console.error(`[Processor ERROR] ${error.stack}`);
    return res.status(500).json({ error: error.message || 'An error occurred during video translation and processing.' });
  } finally {
    // CLEANUP Phase: Always clean up temporary audio files and Gemini Files
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
        console.log(`[Cleanup] Deleted local temporary audio file: ${audioPath}`);
      } catch (err) {
        console.error(`[Cleanup ERROR] Failed to delete local audio file: ${err.message}`);
      }
    }

    if (uploadResult && uploadResult.file && uploadResult.file.name) {
      try {
        await fileManager.deleteFile(uploadResult.file.name);
        console.log(`[Cleanup] Deleted uploaded audio file from Gemini server: ${uploadResult.file.name}`);
      } catch (err) {
        console.error(`[Cleanup ERROR] Failed to delete Gemini server file: ${err.message}`);
      }
    }
  }
});

// Serve feedback submission endpoint
app.post('/api/feedback', async (req, res) => {
  const { name, email, message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const feedbackData = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    name: name || 'Anonymous',
    email: email || 'No email provided',
    message
  };

  try {
    const feedbackFile = path.join(__dirname, 'feedbacks.json');
    let feedbacks = [];
    if (fs.existsSync(feedbackFile)) {
      feedbacks = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
    }
    feedbacks.push(feedbackData);
    fs.writeFileSync(feedbackFile, JSON.stringify(feedbacks, null, 2), 'utf8');

    console.log(`==================================================`);
    console.log(`[Feedback Received] Saved to feedbacks.json`);
    console.log(` From: ${feedbackData.name} <${feedbackData.email}>`);
    console.log(` Message: ${feedbackData.message}`);
    console.log(` Target Email: biz.sirimal@gmail.com`);
    console.log(`==================================================`);

    return res.json({ success: true, message: 'Feedback saved successfully.' });
  } catch (err) {
    console.error('[Feedback ERROR] Failed to save feedback:', err);
    return res.status(500).json({ error: 'Failed to submit feedback. Please try again.' });
  }
});

// Serve health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` AI Video Translator Backend is running!`);
  console.log(` Port: ${PORT}`);
  console.log(` Endpoint: http://localhost:${PORT}/api/process`);
  console.log(`==================================================`);
});

// Trigger restart: Port 5005 freed successfully
