// Reading a rendered page the way a reader (or a screen reader) finds things:
// by accessible name (aria-label), role, heading, legend or visible text —
// never by CSS class or component structure (conventions: "Writing tests").

/** Visible text: tags dropped, the usual entities decoded, whitespace collapsed. */
export function text(html: string): string {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export type Element = { tag: string; attributes: string; inner: string; label: string | null };

/** Every element whose opening tag matches `open` (a regex on the whole opening tag), with its inner HTML up to its own closing tag. */
export function elements(html: string, open: RegExp): Element[] {
  const found: Element[] = [];
  const start = new RegExp(open.source, open.flags.includes("g") ? open.flags : `${open.flags}g`);
  for (const m of html.matchAll(start)) {
    const tag = m[0].match(/^<([a-zA-Z0-9]+)/)?.[1];
    if (!tag) continue;
    const begin = (m.index ?? 0) + m[0].length;
    const inner = m[0].endsWith("/>") ? "" : innerUntilClose(html, tag, begin);
    found.push({ tag, attributes: m[0], inner, label: m[0].match(/\baria-label="([^"]*)"/)?.[1] ?? null });
  }
  return found;
}

function innerUntilClose(html: string, tag: string, from: number): string {
  const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, "g");
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].startsWith("</")) depth--;
    else if (m[1] !== "/") depth++;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Elements with this accessible name (aria-label), optionally of one tag. */
export function labelled(html: string, label: string | RegExp, tag = "[a-zA-Z0-9]+"): Element[] {
  const name = typeof label === "string" ? escape(label.replace(/'/g, "&#x27;")) : label.source;
  return elements(html, new RegExp(`<${tag}\\b[^>]*\\baria-label="(?:${name})"[^>]*>`));
}

/** The inner HTML of the first element with this accessible name, or null. */
export function region(html: string, label: string | RegExp, tag?: string): string | null {
  return labelled(html, label, tag)[0]?.inner ?? null;
}

/** Elements of one ARIA role. */
export function withRole(html: string, role: string): Element[] {
  return elements(html, new RegExp(`<[a-zA-Z0-9]+\\b[^>]*\\brole="${escape(role)}"[^>]*>`));
}

/** The fieldset whose legend reads `legend`, inner HTML; null when none. */
export function fieldset(html: string, legend: string): string | null {
  return elements(html, /<fieldset\b[^>]*>/).find((f) => text(f.inner.match(/<legend[^>]*>(.*?)<\/legend>/s)?.[1] ?? "") === legend)?.inner ?? null;
}

/** The links of a navigation region, each with its text, its href and whether it is marked current (aria-current) or pressed (aria-pressed). */
export function links(html: string): { text: string; href: string | null; current: boolean; pressed: boolean }[] {
  return elements(html, /<a\b[^>]*>/).map((a) => ({
    text: text(a.inner),
    href: a.attributes.match(/\bhref="([^"]*)"/)?.[1].replace(/&amp;/g, "&") ?? null,
    current: /\baria-current="(?!false)[^"]+"/.test(a.attributes),
    pressed: /\baria-pressed="true"/.test(a.attributes),
  }));
}

const PHASE_NAMES = ["Standards", "Qualification", "Selection", "Live", "After"];

/** The Phase bar's steps as text ("Live ● now"), links and greyed ones alike. */
export function phaseBar(html: string): string[] {
  const nav = region(html, "Phases", "nav") ?? "";
  return elements(nav, /<(?:a|span)\b[^>]*>/)
    .filter((e) => PHASE_NAMES.some((p) => text(e.inner).startsWith(p)))
    .map((e) => text(e.inner));
}

/** The shown phase's panel (the region named after a Phase), with its text. */
export function phasePanel(html: string): { phase: string; text: string; html: string } | undefined {
  const panel = labelled(html, new RegExp(PHASE_NAMES.join("|")), "section")[0];
  return panel ? { phase: panel.label!, text: text(panel.inner), html: panel.inner } : undefined;
}

/** A page's step region in the Run sheet or Live day pass (named after its step heading), without its Back / Next footer. */
export function stepRegion(html: string): string {
  const step = region(html, /\d+\. [^"]+/, "section") ?? "";
  return step.replace(/<form\b[^>]*aria-label="Step navigation"[^>]*>.*?<\/form>/s, "");
}
