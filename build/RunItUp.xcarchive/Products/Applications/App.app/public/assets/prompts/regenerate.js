const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'AIzaSyARu6OzYoWKufTTYIyuRfd0MvIfhVwnmhM';
const MODEL = 'gemini-3.1-flash-image-preview';
const PROMPTS_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, '..', 'photos', 'campaign');
const LOGO_PATH = path.join(__dirname, '..', 'logo.png');

// Read logo as base64 reference image
const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');

// Only regenerate these specific files
const REGEN_FILES = [
  '02-tuesday-night-solo.json',
  '03-saturday-morning-pack.json',
  '04-the-check-in.json',
  '05-pace-group-duo.json',
  '06-the-streak-shadow.json'
];

function makeRequest(promptJson) {
  return new Promise((resolve, reject) => {
    const promptText = `Generate a photorealistic image based on this detailed photography brief:\n\n${JSON.stringify(promptJson, null, 2)}\n\nIMPORTANT RULES:\n1. Ultra-photorealistic photography, not illustration or CGI.\n2. Hard dramatic lighting. Real sweat on skin. Urban athletic campaign energy like Oakley and Nike ads.\n3. The brand colors #BFFF00 (neon lime green) and #FF6B2B (orange) should appear naturally in the environment through abstract neon light, streetlights, clothing accents, and reflections.\n4. DO NOT generate any readable text or signage in the image. No words on buildings, signs, or storefronts. Neon signs should be abstract colored light or blurred beyond readability.\n5. I am attaching the Run It UP! logo. Some subjects should be wearing clothing (tees, tanks, hats, headbands) that features this exact logo design — the circular black badge with "RUN IT UP!" in white and lime green with "SOCIAL RUN CLUB" underneath. Show it clearly on at least one person's shirt or hat.`;

    const body = JSON.stringify({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: logoBase64
            }
          },
          { text: promptText }
        ]
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
          resolve(JSON.parse(data));
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
        return { data: part.inlineData.data, mimeType: part.inlineData.mimeType };
      }
    }
  }
  return { error: 'No image in response: ' + JSON.stringify(response).slice(0, 300) };
}

async function generateOne(promptFile, index) {
  const name = promptFile.replace('.json', '');
  const outputFile = path.join(OUTPUT_DIR, `${name}.png`);

  // Delete existing so we regenerate
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  console.log(`[${index + 1}/${REGEN_FILES.length}] Regenerating ${name}...`);

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
  console.log('Regenerating with logo reference + no signage text...\n');
  const results = [];

  for (let i = 0; i < REGEN_FILES.length; i++) {
    const result = await generateOne(REGEN_FILES[i], i);
    results.push(result);
    if (i < REGEN_FILES.length - 1 && result.status === 'success') {
      console.log('  (waiting 3s...)\n');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n========== RESULTS ==========');
  const success = results.filter(r => r.status === 'success');
  const errors = results.filter(r => r.status === 'error');
  console.log(`Success: ${success.length} | Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('\nFailed:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }
}

main().catch(console.error);
