/**
 * Prompt Builder for Ad Creative Generation
 * Constructs prompts for AI image generation and creative layout
 *
 * Design philosophy: Generate BACKGROUNDS and BACKDROPS, not complete ads.
 * The AI image is one layer. Text, mockups, and design elements are composited on top.
 */

interface CreativeContext {
  productName: string;
  productDescription: string;
  productType: 'app' | 'physical' | 'service' | 'saas';
  targetAudience: string;
  painPoint: string;
  mainBenefit: string;
  offer: string;
  cta: string;
  brandColors?: {
    primary: string;
    secondary: string;
    accent?: string;
    background?: string;
  };
  existingAds?: string[];
}

type VisualApproach = 'clean-background' | 'product-hero' | 'lifestyle' | 'pure-design';

interface PromptConfig {
  stage: 'problem-aware' | 'solution-aware' | 'product-aware' | 'most-aware';
  framework: 'PAS' | 'AIDA' | 'BFB' | '4U' | 'story' | 'curiosity' | 'callout';
  format: '1:1' | '4:5' | '9:16';
  template: string;
  visualApproach: VisualApproach;
}

/**
 * Determine the best visual approach based on product type and template
 */
export function selectVisualApproach(
  productType: CreativeContext['productType'],
  template: string
): VisualApproach {
  // App/SaaS products should primarily use clean backgrounds
  // The app UI mockup IS the visual - not AI-generated people
  if (productType === 'app' || productType === 'saas') {
    if (template === 'testimonialEditorial') return 'lifestyle';
    if (template === 'darkHero') return 'clean-background';
    return 'clean-background'; // 70%+ should be this
  }

  // Physical products get product hero shots
  if (productType === 'physical') {
    if (template === 'testimonialEditorial') return 'lifestyle';
    if (template === 'offerLayout') return 'product-hero';
    return 'product-hero';
  }

  // Services default to clean design
  return 'clean-background';
}

/**
 * Build the AI image generation prompt
 * This generates the BACKGROUND layer, not the complete ad
 */
export function buildImageGenerationPrompt(
  context: CreativeContext,
  config: PromptConfig,
  copy: {
    headline: string;
    subheadline?: string;
    cta: string;
  }
): { prompt: string; negativePrompt: string; approach: VisualApproach } {
  const { stage, format } = config;
  const approach = config.visualApproach;

  let prompt = '';
  let negativePrompt = '';

  // Common negative blockers for all approaches
  const baseNegative = 'text, words, letters, numbers, watermark, logo, signature, cluttered, busy, amateur, low quality, blurry, distorted, deformed, ugly, cartoon, illustration, clip art, cheap, overprocessed, AI generated look, digital art, render, CGI';

  if (approach === 'clean-background' || approach === 'pure-design') {
    // APPROACH A: Clean design backgrounds
    // For app/SaaS products - the app mockup gets composited on top
    const bgStyles: Record<string, string> = {
      'problem-aware': 'muted, slightly desaturated, subtle tension',
      'solution-aware': 'warm, inviting, subtle optimism',
      'product-aware': 'clean, professional, premium brand feel',
      'most-aware': 'bold, high energy, dynamic',
    };

    prompt = `Clean minimalist advertising background. ${bgStyles[stage] || 'professional, premium'}. `;

    if (context.brandColors) {
      prompt += `Color palette: soft gradient from ${context.brandColors.primary} to ${context.brandColors.background || 'white'}. `;
    }

    prompt += 'Subtle abstract shapes or soft light effects. Premium commercial aesthetic. ';
    prompt += 'No text, no people, no objects, no products. ';
    prompt += 'Studio-quality lighting. High-end brand campaign backdrop. ';
    prompt += '8k resolution, sharp, professional photography backdrop.';

    negativePrompt = baseNegative + ', people, faces, hands, objects, products, furniture, rooms, specific locations';

  } else if (approach === 'product-hero') {
    // APPROACH B: Product hero shots
    // For physical products - dramatic product photography
    const stageStyles: Record<string, string> = {
      'problem-aware': 'moody dramatic lighting, dark tones',
      'solution-aware': 'bright aspirational lighting, clean composition',
      'product-aware': 'premium studio lighting, luxury feel',
      'most-aware': 'bold dynamic angle, attention-grabbing',
    };

    prompt = `Professional product photography, commercial advertising shot. `;
    prompt += `${stageStyles[stage] || 'premium studio lighting'}. `;
    prompt += `${context.productDescription}. `;
    prompt += 'Shot with 85mm lens, f/2.0, ISO 200. Shallow depth of field. ';
    prompt += 'Premium brand aesthetic, luxury commercial photography. ';

    if (context.brandColors) {
      prompt += `Color harmony with ${context.brandColors.primary}. `;
    }

    prompt += 'Clean background with product as clear hero. 8k resolution.';

    negativePrompt = baseNegative + ', multiple products, distracting background, stock photo look';

  } else if (approach === 'lifestyle') {
    // APPROACH C: Lifestyle context
    // Only for testimonials or when a person is specifically needed
    const stageStyles: Record<string, string> = {
      'problem-aware': 'emotional, candid, documentary style, muted tones',
      'solution-aware': 'aspirational, bright, hope and possibility',
      'product-aware': 'professional, confident, product visible in shot',
      'most-aware': 'energetic, bold, dynamic',
    };

    prompt = `Professional lifestyle photography for advertising. `;
    prompt += `${stageStyles[stage] || 'professional, authentic'}. `;
    prompt += `Person from ${context.targetAudience} demographic. `;
    prompt += 'Shot with 85mm lens, f/2.0, ISO 200. Documentary realism style. ';
    prompt += 'Candid, authentic moment. Clean background, shallow depth of field. ';
    prompt += 'Do not beautify or alter features. No smoothing, no plastic skin. ';
    prompt += 'Professional photography, cinematic lighting, 8k resolution.';

    negativePrompt = baseNegative + ', plastic skin, skin smoothing, airbrushed texture, beautification filters, stylized realism, stock photo pose';
  }

  // Format-specific notes
  if (format === '9:16') {
    prompt += ' Vertical composition, leave space for text overlay in top third.';
  } else if (format === '4:5') {
    prompt += ' Portrait composition, leave space for text overlay.';
  }

  return { prompt, negativePrompt, approach };
}

export function buildCopyPrompt(
  context: CreativeContext,
  config: Omit<PromptConfig, 'format' | 'visualApproach'>
): string {
  let prompt = `Write ad copy for a ${config.stage} audience using the ${config.framework} framework.\n\n`;
  prompt += `Product: ${context.productName}\n`;
  prompt += `Description: ${context.productDescription}\n`;
  prompt += `Target Audience: ${context.targetAudience}\n`;
  prompt += `Pain Point: ${context.painPoint}\n`;
  prompt += `Main Benefit: ${context.mainBenefit}\n`;
  prompt += `Offer: ${context.offer}\n`;
  prompt += `CTA: ${context.cta}\n\n`;

  // Framework-specific instructions
  const frameworkInstructions: Record<string, string> = {
    'PAS': `Structure:\n1. Problem: Call out ${context.painPoint}\n2. Agitate: Make it emotionally painful\n3. Solution: Introduce ${context.productName} as relief`,
    'AIDA': `Structure:\n1. Attention: Pattern interrupt hook\n2. Interest: Relatable context for ${context.targetAudience}\n3. Desire: Benefits + proof for ${context.mainBenefit}\n4. Action: ${context.cta}`,
    'BFB': `Structure:\n1. Before: ${context.painPoint}\n2. After: ${context.mainBenefit}\n3. Bridge: How ${context.productName} gets you there`,
    '4U': `Must be:\n- Urgent: Time-sensitive\n- Unique: Specific to ${context.productName}\n- Useful: Clear ${context.mainBenefit}\n- Ultra-specific: Include concrete numbers/timeframes`,
    'story': `Start mid-action. Show don't tell. Relatable ${context.targetAudience} scenario. End with ${context.cta}.`,
    'curiosity': `Open with unexpected claim about ${context.painPoint}. Withhold full answer. Promise reveal with ${context.cta}.`,
    'callout': `Direct callout format: "${context.targetAudience} who [specific situation]..." then introduce ${context.mainBenefit}.`,
  };

  prompt += frameworkInstructions[config.framework] || '';

  // STRICT copy constraints — QA will reject anything that breaks these
  prompt += `\n\n## STRICT COPY RULES (QA ENFORCED)\n`;
  prompt += `MAXIMUM 3 text elements total: headline + optional subheadline + CTA. That's it. Nothing else.\n`;
  prompt += `- Headline: max 6 words. Must be readable at thumbnail size. This is 80px+ on canvas.\n`;
  prompt += `- Subheadline: max 10 words. Optional. If the headline says it all, skip this.\n`;
  prompt += `- CTA: max 3 words. Action verb first.\n`;
  prompt += `- For comparison template: "old thing | new thing" format. Keep each side under 5 words.\n`;
  prompt += `- For checklist template: max 4 bullet points separated by |, each under 5 words.\n`;
  prompt += `- NO generic phrases. Be specific to ${context.targetAudience}.\n`;
  prompt += `- If you can cut a word without losing meaning, cut it.\n`;

  prompt += `\nOutput format:\n`;
  prompt += `Headline: [max 6 words]\n`;
  prompt += `Subheadline: [optional, max 10 words]\n`;
  prompt += `CTA: [max 3 words]\n`;

  return prompt;
}

/**
 * Generate the creative plan with new template system
 */
export function generateCreativePlan(
  context: CreativeContext,
  distribution: Record<string, number> = {
    'problem-aware': 2,
    'solution-aware': 2,
    'product-aware': 3,
    'most-aware': 3,
  }
): Omit<PromptConfig, 'format'>[] {
  const creatives: Omit<PromptConfig, 'format'>[] = [];

  const frameworksByStage: Record<string, string[]> = {
    'problem-aware': ['PAS', 'story', 'curiosity', 'callout'],
    'solution-aware': ['BFB', 'callout', 'AIDA'],
    'product-aware': ['AIDA', '4U', 'PAS'],
    'most-aware': ['4U', 'AIDA'],
  };

  // New templates mapped to frameworks and product types
  const templatesByFramework: Record<string, string[]> = {
    'PAS': ['boldComparison', 'editorialHeadline', 'darkHero'],
    'AIDA': ['appShowcase', 'featureChecklist', 'editorialHeadline'],
    'BFB': ['boldComparison', 'editorialHeadline'],
    '4U': ['offerLayout', 'dataDriven', 'appShowcase'],
    'story': ['testimonialEditorial', 'editorialHeadline'],
    'curiosity': ['darkHero', 'editorialHeadline'],
    'callout': ['featureChecklist', 'appShowcase'],
  };

  for (const [stage, count] of Object.entries(distribution)) {
    const frameworks = frameworksByStage[stage];

    for (let i = 0; i < count; i++) {
      const framework = frameworks[i % frameworks.length] as PromptConfig['framework'];
      const templateOptions = templatesByFramework[framework];
      const template = templateOptions[i % templateOptions.length];
      const visualApproach = selectVisualApproach(context.productType, template);

      creatives.push({
        stage: stage as PromptConfig['stage'],
        framework,
        template,
        visualApproach,
      });
    }
  }

  return creatives;
}
