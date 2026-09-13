import { memo, Fragment, type ReactNode } from 'react';
import { safeSourceUrl } from '@/lib/food/nutrition-search-transport';
import styles from './GlobalCoach.module.css';

// React escapes all text. Only HTTPS domain links passing the literal-host checks are interactive;
// HTML and images remain inert, including in saved messages.
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]\n]+)\]\(([^\s)]+)\)$/.exec(part);
    const candidate = link ? safeSourceUrl(link[2]) : null;
    const host = candidate ? new URL(candidate).hostname.replace(/\.$/, '') : '';
    const href = candidate && /\.[a-z]{2,}$/i.test(host) && !/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/i.test(host) ? candidate : null;
    if (link && href) return <a key={index} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
export const ResponseText = memo(function ResponseText({ text, assistant = false, userStatement }: { text: string; assistant?: boolean; userStatement?: string }) {
  // Legacy server wrappers are presentation metadata. Retain the stored source
  // untouched and only suppress the exact duplicated user statement we know.
  let displayText = assistant ? text.replace(/^Private Luna pilot:\s*/, '') : text;
  if (assistant && userStatement) {
    const repeated = `\nUser statement (unverified): ${userStatement}`;
    const index = displayText.lastIndexOf(repeated);
    const tail = index < 0 ? '' : displayText.slice(index + repeated.length);
    if (index >= 0 && (!tail.trim() || tail.startsWith('\nRecorded facts:'))) displayText = displayText.slice(0, index) + tail;
  }
  const blocks: ReactNode[] = [];
  const lines = displayText.split(/\r?\n/);
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) { index++; continue; }
    const ordered = /^\s*\d+[.)]\s+/.test(lines[index]);
    const bullet = /^\s*[-*•]\s+/.test(lines[index]);
    if (ordered || bullet) {
      const items: ReactNode[] = []; const start = index;
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/;
      while (index < lines.length && pattern.test(lines[index])) {
        items.push(<li key={index}>{inline(lines[index].replace(pattern, ''))}</li>); index++;
      }
      blocks.push(ordered ? <ol key={start}>{items}</ol> : <ul key={start}>{items}</ul>);
    } else {
      const start = index; const paragraph: string[] = [];
      while (index < lines.length && lines[index].trim() && !/^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[index])) paragraph.push(lines[index++]);
      blocks.push(<p key={start}>{inline(paragraph.join('\n'))}</p>);
    }
  }
  return <div className={styles.responseText}>{blocks}</div>;
});
