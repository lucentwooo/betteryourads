/**
 * Nano Banana 2 (Kie.ai) Integration
 * Uses Dense Narrative JSON prompts for photorealistic output
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CreativeContext {
  productName: string;
  productDescription: string;
  targetAudience: string;
  painPoint: string;
  mainBenefit: string;
  offer: string;
  cta: string;
  brandColors?: {
    primary: string;
    secondary: string;
  };
}

interface GenerationParams {
  visualDirection: string;
  stage: 'problem-aware' | 'solution-aware' | 'product-aware' | 'most-aware';
  framework: string;
  format: '1:1' | '4:5' | '9:16';
}

/**
 * Build Dense Narrative JSON prompt for Nano Banana 2
 * Based on Kie.ai best practices for photorealistic output
 */
function buildDenseNarrativePrompt(
  visualDirection: string,
  stage: string,
  framework: string,
  brandColors?: { primary: string; secondary: string }
): object {
  // Stage-specific visual language
  const stageModifiers: Record<string, string> = {
    'problem-aware': 'emotional scene showing struggle, candid documentary style, muted tones, empathetic lighting, relatable moment',
    'solution-aware': 'aspirational transformation, bright uplifting lighting, hope and possibility, professional photography, success moment',
    'product-aware': 'product hero shot, lifestyle context, clean modern aesthetic, professional photography, aspirational',
    'most-aware': 'bold dynamic composition, high contrast, urgency, attention-grabbing, offer-focused visual'
  };

  // Framework modifiers
  const frameworkModifiers: Record<string, string> = {
    'PAS': 'dramatic tension, before state imagery, emotional struggle, problem-focused',
    'AIDA': 'pattern interrupt, unexpected angle, bold visual, attention-grabbing',
    'BFB': 'transformation visual, clear contrast, journey metaphor, before and after energy',
    '4U': 'urgent composition, numbers prominent, time-sensitive, deadline-focused',
    'story': 'candid authentic moment, UGC aesthetic, real world, documentary style',
    'curiosity': 'intriguing mysterious, open loop visual, question-raising',
    'callout': 'direct gaze, personal connection, confrontational but friendly'
  };

  // Build dense narrative
  const promptParts = [
    visualDirection,
    stageModifiers[stage] || '',
    frameworkModifiers[framework] || ''
  ].filter(Boolean);

  // Camera settings for realism (critical for Nano Banana 2)
  const cameraSettings = 'Shot with 85mm lens, f/2.0, ISO 200. Documentary realism style. Direct camera settings for optical physics.';

  // Explicit imperfection commands (prevents "AI look")
  const imperfectionCommands = 'Do not beautify or alter features. No smoothing, no plastic skin. Visible pores, natural imperfections, unretouched skin texture.';

  // Combine
  let fullPrompt = promptParts.join(' ');
  fullPrompt += ` ${cameraSettings} ${imperfectionCommands}`;

  // Brand colors
  if (brandColors) {
    fullPrompt += ` Color palette includes ${brandColors.primary} and ${brandColors.secondary}, harmonious brand colors integrated naturally.`;
  }

  // Quality modifiers
  const qualityModifiers = 'professional photography, high-end commercial aesthetic, cinematic lighting, 8k resolution, sharp focus, premium quality, modern design, advertising campaign style';
  fullPrompt += ` ${qualityModifiers}`;

  // Comprehensive negative prompt (blocks "AI style")
  const negativePrompt = [
    'text', 'words', 'letters', 'watermark', 'logo', 'signature',
    'cluttered', 'busy', 'amateur', 'low quality', 'blurry', 'distorted',
    'deformed', 'ugly', 'cartoon', 'illustration', 'clip art', 'cheap',
    'stock photo look', 'overprocessed', 'plastic skin', 'skin smoothing',
    'airbrushed texture', 'anatomy normalization', 'body proportion averaging',
    'beautification filters', 'stylized realism', 'editorial fashion proportions',
    'more realistic reinterpretation', 'dataset-average', 'AI generated look',
    'digital art', 'render', 'CGI', '3D', 'unrealistic'
  ].join(', ');

  // Build JSON payload for Kie.ai
  return {
    prompt: fullPrompt,
    negative_prompt: negativePrompt,
    settings: {
      resolution: '1024x1024',
      style: 'documentary realism, candid, unretouched, photorealistic',
      lighting: 'natural realistic lighting, professional lighting setup',
      camera_angle: 'eye level, professional composition',
      depth_of_field: 'shallow depth of field, bokeh background',
      quality: 'high detail, photorealistic, unretouched, realistic textures'
    },
    api_parameters: {
      resolution: '1K',
      output_format: 'png',
      aspect_ratio: 'auto'
    }
  };
}

/**
 * Generate image using Python script
 */
function runPythonScript(
  promptJson: object,
  outputPath: string,
  aspectRatio: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'nano-banana-kie.py');

    // Write prompt to temp file
    const tempPromptPath = `${outputPath}.prompt.json`;
    fs.writeFileSync(tempPromptPath, JSON.stringify(promptJson, null, 2));

    const python = spawn('python3', [
      scriptPath,
      tempPromptPath,
      outputPath,
      aspectRatio
    ]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(data.toString().trim());
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(data.toString().trim());
    });

    python.on('close', (code) => {
      // Cleanup temp file
      try {
        fs.unlinkSync(tempPromptPath);
      } catch {}

      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`Python script failed with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Generate batch of creative images
 */
export async function generateCreativeImages(
  creatives: Array<{
    id: number;
    stage: string;
    framework: string;
    visualDirection: string;
    format: '1:1' | '4:5' | '9:16';
  }>,
  outputDir: string,
  brandColors?: { primary: string; secondary: string }
): Promise<Array<{ id: number; imagePath: string }>> {
  const results: Array<{ id: number; imagePath: string }> = [];

  for (const creative of creatives) {
    const aspectRatio = creative.format.replace(':', '/');
    const outputPath = path.join(outputDir, `creative-${creative.id}-bg.png`);

    console.log(`\nGenerating image for creative ${creative.id}...`);
    console.log(`  Stage: ${creative.stage}`);
    console.log(`  Framework: ${creative.framework}`);
    console.log(`  Format: ${creative.format}`);

    try {
      // Build Dense Narrative prompt
      const promptJson = buildDenseNarrativePrompt(
        creative.visualDirection,
        creative.stage,
        creative.framework,
        brandColors
      );

      // Generate via Python script
      await runPythonScript(promptJson, outputPath, aspectRatio);

      results.push({
        id: creative.id,
        imagePath: outputPath
      });

      console.log(`  ✓ Creative ${creative.id} complete`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error}`);
    }
  }

  return results;
}

/**
 * Generate single image (for testing)
 */
export async function generateSingleImage(
  visualDirection: string,
  stage: string,
  framework: string,
  outputPath: string,
  brandColors?: { primary: string; secondary: string }
): Promise<string> {
  const promptJson = buildDenseNarrativePrompt(
    visualDirection,
    stage,
    framework,
    brandColors
  );

  await runPythonScript(promptJson, outputPath, '1:1');
  return outputPath;
}
