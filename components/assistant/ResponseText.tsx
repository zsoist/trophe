import { Fragment, type ReactNode } from 'react';
import styles from './GlobalCoach.module.css';

// A deliberately small formatting vocabulary. React escapes every text node;
// HTML, images and URLs are never interpreted as executable markup.
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>);
}
export function ResponseText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
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
}
