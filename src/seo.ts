const cardTypeDescriptions: Record<string, string> = {
  awesome: 'an awesome job',
  weekly: 'an amazing week',
  random: 'something special',
  animal: 'a spirit animal message',
  absurd: 'an absurd compliment',
  meta: 'a meta compliment',
  unexpected: 'an unexpected compliment',
};

const CARD_PATH_RE = /^\/card\/(awesome|weekly|random|animal|absurd|meta|unexpected)\/([^/?#]+)/;

/**
 * If the path is a card route, returns HTML with dynamic OG/Twitter meta tags
 * injected. Otherwise returns the HTML unchanged.
 */
export function injectCardMeta(html: string, pathname: string, siteUrl: string): string {
  const match = CARD_PATH_RE.exec(pathname);
  if (!match) return html;

  const type = match[1];
  let rawName: string;
  try {
    rawName = decodeURIComponent(match[2]);
  } catch {
    rawName = match[2];
  }
  const description = cardTypeDescriptions[type] || 'a personalized compliment';

  const ogTitle = `${rawName}, you're doing ${description}! | AJaaS`;
  const ogDescription = `Someone thinks ${rawName} deserves ${description}. Open this card to see the full message.`;
  const baseUrl = siteUrl.replace(/\/+$/, '');
  const ogUrl = `${baseUrl}/card/${type}/${encodeURIComponent(rawName)}`;

  // Replace the static OG title/description/url and Twitter title/description
  let result = html;
  result = result.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapeAttr(ogTitle)}" />`,
  );
  result = result.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapeAttr(ogDescription)}" />`,
  );
  result = result.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${escapeAttr(ogUrl)}" />`,
  );
  result = result.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapeAttr(ogTitle)}" />`,
  );
  result = result.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapeAttr(ogDescription)}" />`,
  );
  result = result.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(ogTitle)}</title>`,
  );
  result = result.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escapeAttr(ogUrl)}" />`,
  );

  return result;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
