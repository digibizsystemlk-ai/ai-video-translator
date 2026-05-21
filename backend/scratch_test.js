const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');
const path = require('path');

async function run() {
  const videoId = 'IX3BclbFTbw';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"'
  };

  try {
    const cookiesPath = path.join(__dirname, 'cookies.json');
    if (fs.existsSync(cookiesPath)) {
      const cookiesArray = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      const cookieHeader = cookiesArray.map(c => `${c.name}=${c.value}`).join('; ');
      headers['cookie'] = cookieHeader;
    }
  } catch (err) {}

  try {
    console.log("Fetching watch page...");
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers });
    const html = await response.text();
    const regex = /"captionTracks"\s*:\s*(\[[^\]]*\])/;
    const match = html.match(regex);
    if (!match) throw new Error("No captionTracks found!");

    const captionTracks = JSON.parse(match[1]);
    const selectedTrack = captionTracks[0];
    const baseUrl = selectedTrack.baseUrl;
    console.log(`Base URL: ${baseUrl}`);

    const formats = ['json3', 'vtt', 'srv1', 'srv3'];
    for (const fmt of formats) {
      const testUrl = `${baseUrl}&fmt=${fmt}`;
      console.log(`Testing with &fmt=${fmt}...`);
      const res = await fetch(testUrl, { headers });
      const text = await res.text();
      console.log(`Status: ${res.status}, Length: ${text.length} bytes`);
      if (text.length > 0) {
        console.log(`Success! First 150 chars:`, text.slice(0, 150));
        return;
      }
    }
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}

run();
