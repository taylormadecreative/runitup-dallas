const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'AIzaSyARu6OzYoWKufTTYIyuRfd0MvIfhVwnmhM';
const MODEL = 'gemini-3.1-flash-image-preview';
const PROMPTS_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, '..', 'photos', 'campaign');

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Get all JSON prompt files (exclude this script)
const promptFiles = fs.readdirSync(PROMPTS_DIR)
  .filter(f => f.endsWith('.json'))
  .sort();

console.log(`Found ${promptFiles.length} prompts to generate:\n`);
promptFiles.forEach(f => console.log(`  - ${f}`));
console.log('');

function makeRequest(promptJson) {
  return new Promise((resolve, reject) => {
    // Convert JSON prompt to a descriptive string for Gemini
    const promptText = `Generate a photorealistic image based on this detailed photography brief:\n\n${JSON.stringify(promptJson, null, 2)}\n\nIMPORTANT: This must be ultra-photorealistic photography, not illustration or CGI. Hard dramatic lighting. Real sweat on skin. Urban athletic campaign energy like Oakley and Nike ads. The brand colors #BFFF00 (neon lime green) and #FF6B2B (orange) should appear naturally in the environment through neon signs, streetlights, clothing, and reflections.`;

    const body = JSON.stringify({
      contents: [{
        parts: [{ text: promptText }]
      }],
      generationConfig: {
        responseModalities: ['image', 'text']
      }
    });

    const url = `/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}\nRaw: ${data.slice(0, 500)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timed out after 120s'));
    });
    req.write(body);
    req.end();
  });
}

function extractImage(response) {
  if (response.error) {
    return { error: response.error.message || JSON.stringify(response.error) };
  }

  const candidates = response.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType
        };
      }
    }
  }
  return { error: 'No image in response: ' + JSON.stringify(response).slice(0, 300) };
}

async function generateOne(promptFile, index) {
  const name = promptFile.replace('.json', '');
  const outputFile = path.join(OUTPUT_DIR, `${name}.png`);

  // Skip if already generated
  if (fs.existsSync(outputFile)) {
    console.log(`[${index + 1}/${promptFiles.length}] SKIP ${name} (already exists)`);
    return { name, status: 'skipped' };
  }

  console.log(`[${index + 1}/${promptFiles.length}] Generating ${name}...`);

  try {
    const promptJson = JSON.parse(fs.readFileSync(path.join(PROMPTS_DIR, promptFile), 'utf8'));
    const response = await makeRequest(promptJson);
    const image = extractImage(response);

    if (image.error) {
      console.log(`  ERROR: ${image.error}`);
      return { name, status: 'error', error: image.error };
    }

    const buffer = Buffer.from(image.data, 'base64');
    fs.writeFileSync(outputFile, buffer);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
    console.log(`  SAVED ${outputFile} (${sizeMB} MB)`);
    return { name, status: 'success', size: sizeMB };
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    return { name, status: 'error', error: err.message };
  }
}

async function main() {
  console.log('Starting image generation...\n');
  const results = [];

  // Run sequentially to respect rate limits
  for (let i = 0; i < promptFiles.length; i++) {
    const result = await generateOne(promptFiles[i], i);
    results.push(result);

    // Brief pause between requests to avoid rate limiting
    if (i < promptFiles.length - 1 && result.status === 'success') {
      console.log('  (waiting 3s for rate limit...)\n');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n========== RESULTS ==========');
  const success = results.filter(r => r.status === 'success');
  const errors = results.filter(r => r.status === 'error');
  const skipped = results.filter(r => r.status === 'skipped');

  console.log(`Success: ${success.length} | Errors: ${errors.length} | Skipped: ${skipped.length}`);

  if (errors.length > 0) {
    console.log('\nFailed prompts:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }

  if (success.length > 0) {
    console.log(`\nImages saved to: ${OUTPUT_DIR}`);
  }
}

main().catch(console.error);
