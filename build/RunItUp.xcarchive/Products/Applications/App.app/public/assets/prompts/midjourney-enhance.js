const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'AIzaSyARu6OzYoWKufTTYIyuRfd0MvIfhVwnmhM';
const MODEL = 'gemini-3.1-flash-image-preview';
const INPUT_DIR = '/Users/nelsontaylor/Downloads/midjourney_session';
const OUTPUT_DIR = '/Users/nelsontaylor/Documents/runitup-app/assets/photos/enhanced';
const LOGO_PATH = '/Users/nelsontaylor/Documents/runitup-app/assets/logo.png';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');

const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.png')).sort();
console.log(`Found ${files.length} Midjourney images to enhance.\n`);

// Assign specific shoe brands + accessories to each image for variety
const shoeAssignments = [
  { shoes: 'Nike Air Max 95 in neon volt green and black', shades: 'Oakley Sutro sport sunglasses in matte black with lime green mirrored lenses', watch: 'Apple Watch Ultra 2 with orange Alpine Loop band', logo: false },
  { shoes: 'New Balance Fresh Foam X 1080v13 in white and lime green', shades: null, watch: 'Apple Watch Series 9 with black Sport Band', logo: false },
  { shoes: 'mixed group — lead runner in Nike Vaporfly 3 in neon green, others in Adidas Ultraboost in core black, New Balance 990v6 in grey', shades: 'one runner wearing Oakley Radar EV Path in polished black', watch: 'multiple Apple Watches visible, different band colors', logo: false },
  { shoes: 'mixed group — Nike Air Max Plus in black and volt, Adidas Adizero SL in lime green, Puma Velocity Nitro 3 in black and orange', shades: null, watch: 'Apple Watch with neon green Nike Sport Band on the lead runner', logo: false },
  { shoes: 'Nike Pegasus 41 in black and neon green, some runners in Adidas Ultraboost Light in white', shades: 'one runner in Oakley Flak 2.0 XL in matte black', watch: 'Apple Watch Series 9 with Starlight Sport Band', logo: false },
  { shoes: 'Puma Deviate Nitro 3 in lime green and black', shades: 'Oakley Sutro Lite in polished black with prizm road lenses', watch: null, logo: false },
  { shoes: 'New Balance FuelCell SuperComp Elite v4 in white and neon green', shades: null, watch: 'Apple Watch Ultra 2 with green Alpine Loop', logo: false },
  { shoes: 'mixed — Nike Air Max 97 in silver and volt, Adidas SL20.3 in core black and solar green, New Balance Fresh Foam in white', shades: 'Oakley Encoder in matte black with prizm lenses on one runner', watch: 'Apple Watches on at least two runners', logo: false },
  { shoes: 'Nike ZoomX Invincible 3 in volt and black', shades: null, watch: 'Apple Watch with black Nike Sport Band', logo: false },
  { shoes: 'Adidas Adizero Boston 12 in lucid lemon and black', shades: 'Oakley Radar EV Path in polished white', watch: 'Apple Watch Series 9 with orange Sport Band', logo: false },
  { shoes: 'mixed crowd — Nike Air Max 90 in infrared, Puma Magnify Nitro 2 in black, Adidas Ultraboost in white, New Balance 997H in grey', shades: 'multiple runners in Oakley sport sunglasses', watch: 'Apple Watches scattered throughout the crowd', logo: false },
  { shoes: 'Nike Pegasus 41 in white and volt, some in New Balance 880v14 in black', shades: null, watch: 'Apple Watch Ultra with orange band on lead runner', logo: false },
  { shoes: 'Adidas Adizero Adios Pro 3 in beam yellow and black, others in Nike Infinity Run 4 in black', shades: 'Oakley Sutro in neon yellow frame', watch: 'Apple Watch with lime green Nike band', logo: false },
  { shoes: 'Nike Air Max Plus in black and volt green, Puma Fast-R Nitro Elite 2 in fiery coral and black', shades: null, watch: 'Apple Watch Series 9 with black band', logo: false }
];

function makeRequest(imageBase64, assignment, index) {
  return new Promise((resolve, reject) => {
    const promptText = `You are receiving two images:
1. A reference logo for "Run It UP!" social run club (circular black badge with lime green and white text)
2. A Midjourney-generated image of runners in a city

Your job: RECREATE this exact scene as an ultra-photorealistic photograph. Keep the same composition, angles, poses, number of people, and energy — but make it look like a real photo taken with a high-end camera.

CRITICAL REQUIREMENTS — apply ALL of these:

SKIN: Ultra-realistic skin texture — visible pores, sweat beads, sweat sheen on foreheads/arms/legs, natural skin imperfections, realistic muscle definition. Skin should look WET from running. No airbrushing, no smooth plastic skin.

SHOES: The runners MUST be wearing recognizable name-brand running shoes: ${assignment.shoes}. The shoes should be clearly identifiable with visible brand details, correct silhouettes, and proper lacing. Shoes are a focal point — make them crisp and detailed.

${assignment.shades ? `SUNGLASSES: ${assignment.shades}. The sunglasses should look real — proper frame thickness, reflections in lenses, sitting naturally on the face.` : 'No sunglasses on these runners.'}

${assignment.watch ? `WATCH: ${assignment.watch}. The watch face should be slightly visible or at least the band clearly identifiable as Apple Watch.` : ''}

${assignment.logo ? `RUN IT UP LOGO: 1-2 runners should be wearing clothing with the Run It UP! logo SCREEN-PRINTED directly into the fabric — NOT a sticker, NOT a patch, NOT a digital overlay. The logo (circular black badge with "RUN IT UP!" in white and lime green text) must look like it was heat-pressed or screen-printed onto the garment at a factory. Critical realism details:
- The fabric texture (cotton weave, dri-fit mesh) must be visible THROUGH the printed ink
- Where the shirt wrinkles or folds, the logo print must wrinkle and distort WITH the fabric
- Where sweat has soaked the shirt, the print area should look slightly darker/dampened too
- The ink should have slight wear — not brand new, like it's been washed a few times
- The logo should conform to the body shape underneath (chest curve, shoulder contour)
- Think of how a real Nike swoosh looks on a worn dri-fit shirt — the ink sits IN the fibers, not ON TOP
Do NOT make it look like a circular sticker or badge placed on the shirt. It should look like real athletic merch that someone bought and has been running in for months.` : 'No Run It UP branding on clothing in this image.'}

CLOTHING: Mix of athletic brands — Nike dri-fit, Adidas, Puma, generic running gear. Black, lime green (#BFFF00), and orange (#FF6B2B) as the dominant color palette. Clothes should look worn and sweated-through, not fresh off the rack.

ENVIRONMENT: Keep the same urban city setting from the original. Make it photorealistic — real concrete, real buildings, real lighting. Hard dramatic lighting like a Nike or Oakley ad campaign.

PHOTOGRAPHY: This should look like it was shot on a Sony A1 or Canon R5. Crisp detail on subjects, natural depth of field, realistic motion blur where the original has it. No AI smoothness — this needs editorial grit.

DO NOT add any readable text or signs to the image. Keep signage abstract/blurred.`;

    const body = JSON.stringify({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: logoBase64
            }
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: imageBase64
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
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(180000, () => {
      req.destroy();
      reject(new Error('Request timed out after 180s'));
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

async function processOne(file, index) {
  const name = path.basename(file, '.png');
  // Create shorter output names
  const shortNames = [
    'solo-runner-neon-01',
    'solo-runner-skyline-02',
    'group-sprint-night-03',
    'group-pack-leader-04',
    'group-pack-street-05',
    'duo-women-highway-06',
    'group-low-angle-alley-07',
    'group-low-angle-urban-08',
    'group-low-angle-film-09',
    'group-above-night-10',
    'group-above-crowd-11',
    'group-motion-night-12',
    'group-motion-brick-13',
    'group-motion-blur-14'
  ];

  const outputName = shortNames[index] || `enhanced-${index + 1}`;
  const outputFile = path.join(OUTPUT_DIR, `${outputName}.png`);

  if (fs.existsSync(outputFile)) {
    console.log(`[${index + 1}/${files.length}] SKIP ${outputName} (exists)`);
    return { name: outputName, status: 'skipped' };
  }

  console.log(`[${index + 1}/${files.length}] Enhancing → ${outputName}`);
  console.log(`  Shoes: ${shoeAssignments[index].shoes.slice(0, 60)}...`);
  console.log(`  Logo: ${shoeAssignments[index].logo ? 'YES' : 'no'} | Shades: ${shoeAssignments[index].shades ? 'YES' : 'no'} | Watch: ${shoeAssignments[index].watch ? 'YES' : 'no'}`);

  try {
    const imageBase64 = fs.readFileSync(path.join(INPUT_DIR, file)).toString('base64');
    const assignment = shoeAssignments[index] || shoeAssignments[0];
    const response = await makeRequest(imageBase64, assignment, index);
    const image = extractImage(response);

    if (image.error) {
      console.log(`  ERROR: ${image.error}\n`);
      return { name: outputName, status: 'error', error: image.error };
    }

    const buffer = Buffer.from(image.data, 'base64');
    fs.writeFileSync(outputFile, buffer);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
    console.log(`  SAVED (${sizeMB} MB)\n`);
    return { name: outputName, status: 'success', size: sizeMB };
  } catch (err) {
    console.log(`  ERROR: ${err.message}\n`);
    return { name: outputName, status: 'error', error: err.message };
  }
}

async function main() {
  console.log('Enhancing Midjourney images with real-world details...');
  console.log('Adding: name-brand shoes, Oakley shades, Apple Watches, skin texture, RIU logo\n');

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const result = await processOne(files[i], i);
    results.push(result);
    if (i < files.length - 1 && result.status === 'success') {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  console.log('========== RESULTS ==========');
  const success = results.filter(r => r.status === 'success');
  const errors = results.filter(r => r.status === 'error');
  const skipped = results.filter(r => r.status === 'skipped');
  console.log(`Success: ${success.length} | Errors: ${errors.length} | Skipped: ${skipped.length}`);

  if (errors.length > 0) {
    console.log('\nFailed:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }

  if (success.length > 0) {
    console.log(`\nEnhanced images saved to: ${OUTPUT_DIR}`);
  }
}

main().catch(console.error);
