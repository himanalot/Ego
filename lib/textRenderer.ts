/*
  Shared text rendering utilities for both server-side (Node canvas) and client-side (browser)
  Usage:
    import { drawText } from '@/lib/textRenderer'
*/

interface MarkdownToken {
  text: string;
  bold: boolean;
  italic: boolean;
  isLineBreak?: boolean;
}

export interface DrawOptions {
  x: number;           // starting x (left) coordinate
  y: number;           // starting y (top)  coordinate
  fontSize: number;
  lineHeight: number;  // multiplier (e.g. 1.25)
  maxWidth: number;    // max line width in px
  color: string;
  fontFamily: string;
  fontFamilyBold: string;
  fontFamilyItalic: string;
  fontFamilyBoldItalic: string;
}

function parseMarkdownTokens(text: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      tokens.push({ text: '', bold: false, italic: false, isLineBreak: true });
      continue;
    }

    let remaining = line;
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/^\*\*(.*?)\*\*/);
      if (boldMatch) {
        tokens.push({ text: boldMatch[1], bold: true, italic: false });
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      const italicMatch = remaining.match(/^\*(.*?)\*/);
      if (italicMatch) {
        tokens.push({ text: italicMatch[1], bold: false, italic: true });
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      const nextBold = remaining.search(/\*\*/);
      const nextItalic = remaining.search(/\*/);
      const nextSpecial = Math.min(nextBold === -1 ? Infinity : nextBold, nextItalic === -1 ? Infinity : nextItalic);
      if (nextSpecial === Infinity) {
        tokens.push({ text: remaining, bold: false, italic: false });
        break;
      } else {
        tokens.push({ text: remaining.slice(0, nextSpecial), bold: false, italic: false });
        remaining = remaining.slice(nextSpecial);
      }
    }

    if (i < lines.length - 1) {
      tokens.push({ text: '\n', bold: false, italic: false, isLineBreak: true });
    }
  }

  return tokens;
}

function getFontString(size: number, bold: boolean, italic: boolean, opt: DrawOptions): string {
  const weight = bold ? 'bold' : 'normal';
  const style = italic ? 'italic' : 'normal';
  let family = opt.fontFamily;
  if (bold && italic) family = opt.fontFamilyBoldItalic;
  else if (bold) family = opt.fontFamilyBold;
  else if (italic) family = opt.fontFamilyItalic;
  return `${style} ${weight} ${size}px ${family}`;
}

/**
 * Draws markdown text onto a CanvasRenderingContext2D using identical wrapping logic
 * Returns the bottom-most y coordinate after drawing (i.e. total height consumed)
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  content: string,
  opt: DrawOptions
): number {
  ctx.fillStyle = opt.color;
  ctx.textBaseline = 'top';

  const lineHeightPx = opt.fontSize * opt.lineHeight;
  let yCursor = opt.y;

  const lines = content.split('\n');
  for (const line of lines) {
    const tokens = parseMarkdownTokens(line);
    let xCursor = opt.x;
    let firstWordInLine = true;

    for (const token of tokens) {
      if (token.isLineBreak) continue;

      ctx.font = getFontString(opt.fontSize, token.bold, token.italic, opt);
      const words = token.text.split(' ');
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!word) continue;

        const wordWidth = ctx.measureText(word).width;
        const spaceWidth = ctx.measureText(' ').width;

        // Space needed before this word?
        let spaceNeeded = 0;
        if (!firstWordInLine && !word.match(/^[.,!?;:]/)) {
          spaceNeeded = spaceWidth;
        }

        // Wrap if needed
        if (xCursor + spaceNeeded + wordWidth > opt.x + opt.maxWidth && !firstWordInLine) {
          yCursor += lineHeightPx;
          xCursor = opt.x;
          firstWordInLine = true;
          spaceNeeded = 0; // no leading space after wrap
        }

        // Add space before word
        if (spaceNeeded > 0) {
          xCursor += spaceNeeded;
        }

        ctx.fillText(word, xCursor, yCursor);
        xCursor += wordWidth;

        firstWordInLine = false;
      }
    }

    yCursor += lineHeightPx;
  }

  return yCursor;
} 