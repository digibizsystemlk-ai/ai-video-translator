const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
  try {
    console.log("Testing gemini-2.0-flash with the new API key...");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: "Hi, reply in one word." }
          ]
        }
      ]
    });
    console.log("✅ SUCCESS! gemini-2.0-flash works! Response:", result.response.text().trim());
  } catch (err) {
    console.error("❌ FAILED for gemini-2.0-flash:", err.message);
  }
}

test();
