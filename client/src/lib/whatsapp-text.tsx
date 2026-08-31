/**
 * Render WhatsApp's inline formatting the way the phone does: *bold*,
 * _italic_, ~strikethrough~ and ```monospace```.
 *
 * Shared so a template preview, a chat bubble and a campaign preview all agree
 * on what a message will look like when it lands.
 */
import React from "react";

type Token = {
  type: "text" | "bold" | "italic" | "strike" | "code";
  content: string;
};

// Ordered so ``` is tried before the single-character markers.
const PATTERN = /(```([^`]+)```)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(~([^~\n]+)~)/g;

export function formatWhatsAppText(text: string): React.ReactNode {
  if (!text) return null;

  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  PATTERN.lastIndex = 0;
  while ((match = PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    if (match[1]) tokens.push({ type: "code", content: match[2] });
    else if (match[3]) tokens.push({ type: "bold", content: match[4] });
    else if (match[5]) tokens.push({ type: "italic", content: match[6] });
    else if (match[7]) tokens.push({ type: "strike", content: match[8] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", content: text.slice(lastIndex) });
  }

  if (tokens.length === 0) return <span>{text}</span>;

  return (
    <span>
      {tokens.map((token, i) => {
        switch (token.type) {
          case "bold":
            return <strong key={i}>{token.content}</strong>;
          case "italic":
            return <em key={i}>{token.content}</em>;
          case "strike":
            return <del key={i}>{token.content}</del>;
          case "code":
            return (
              <code key={i} className="font-mono text-[0.92em]">
                {token.content}
              </code>
            );
          default:
            return <span key={i}>{token.content}</span>;
        }
      })}
    </span>
  );
}
