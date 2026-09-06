// Shared XML text decoding for the hand-rolled RSS/Atom collectors
// (collectors/news_rss.mjs, collectors/arxiv.mjs). Both parse XML with regex
// rather than a real XML parser (dependency-free), so decoding the five
// predefined XML entities out of extracted tag text has to be handled by hand
// too. Extracted from news_rss.mjs so arxiv.mjs's extractTag can share it
// instead of returning raw (still-encoded) tag text.
//
// LLM calls in this module: zero.

/** Decode the five predefined XML entities (+ numeric &#39;) in extracted tag text. */
export function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
