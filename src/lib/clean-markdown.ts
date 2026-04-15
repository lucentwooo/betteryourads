/**
 * Clean markdown fragments that Claude returns for display.
 * Strips trailing section separators, stray asterisks, and normalizes whitespace.
 */
export function cleanMarkdown(text: string): string {
  if (!text) return "";

  return text
    // Remove trailing horizontal rules (--- or ***)
    .replace(/\n+---+\s*$/g, "")
    .replace(/\n+\*\*\*+\s*$/g, "")
    // Remove leading/trailing whitespace
    .trim();
}

/**
 * Convert a markdown string to HTML.
 * Handles bold, headers, tables, lists, and paragraphs.
 */
export function markdownToHtml(content: string): string {
  if (!content) return "";

  let html = cleanMarkdown(content);

  // Strip any stray horizontal rules in the middle
  html = html.replace(/\n\s*---+\s*\n/g, "\n\n");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Headers (### -> h4)
  html = html.replace(
    /^### (.+)$/gm,
    '<h4 class="text-base font-semibold mt-4 mb-2">$1</h4>'
  );

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match
      .split("|")
      .filter(Boolean)
      .map((c) => c.trim());
    if (cells.every((c) => /^[-:]+$/.test(c))) return "";
    return `<tr>${cells
      .map(
        (c) => `<td class="border px-3 py-1.5 text-sm align-top">${c}</td>`
      )
      .join("")}</tr>`;
  });
  html = html.replace(
    /(<tr>.*<\/tr>\n?)+/g,
    (match) =>
      `<table class="w-full border-collapse my-4">${match}</table>`
  );

  // Bullet points
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 text-sm">$1</li>');
  html = html.replace(
    /(<li.*<\/li>\n?)+/g,
    (match) => `<ul class="space-y-1 my-2 list-disc">${match}</ul>`
  );

  // Paragraphs (remaining untagged non-empty lines)
  html = html.replace(
    /^(?!<[htul]|$)(.+)$/gm,
    '<p class="text-sm my-1 leading-relaxed">$1</p>'
  );

  // Clean up excess blank lines
  html = html.replace(/\n{3,}/g, "\n\n");

  return html;
}
