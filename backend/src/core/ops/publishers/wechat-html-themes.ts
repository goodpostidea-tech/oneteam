/**
 * 微信公众号文章 HTML 主题系统
 * 全 inline style，兼容微信公众号编辑器
 */

export const THEME_LIST: { id: string; name: string }[] = [
  { id: 'minimal', name: '简约黑白' },
  { id: 'tech-blue', name: '科技蓝' },
  { id: 'warm-orange', name: '暖橙' },
  { id: 'elegant-green', name: '雅致绿' },
  { id: 'dark-pro', name: '深色专业' },
];

interface ThemeTokens {
  body: string;
  h1: string;
  h2: string;
  h3: string;
  p: string;
  blockquote: string;
  code: string;
  codeBlock: string;
  strong: string;
  em: string;
  hr: string;
  ul: string;
  ol: string;
  li: string;
  img: string;
  a: string;
}

const THEMES: Record<string, ThemeTokens> = {
  minimal: {
    body: 'margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.8;color:#333;background:#fff;',
    h1: 'font-size:26px;font-weight:700;color:#111;margin:32px 0 16px;padding-bottom:10px;border-bottom:1px solid #eee;',
    h2: 'font-size:22px;font-weight:700;color:#222;margin:28px 0 14px;',
    h3: 'font-size:18px;font-weight:600;color:#333;margin:24px 0 12px;',
    p: 'margin:0 0 16px;line-height:1.8;',
    blockquote: 'margin:16px 0;padding:12px 20px;border-left:4px solid #ccc;background:#f9f9f9;color:#666;font-size:15px;',
    code: 'background:#f3f3f3;padding:2px 6px;border-radius:3px;font-family:Menlo,Monaco,Consolas,monospace;font-size:14px;color:#555;',
    codeBlock: 'background:#f5f5f5;padding:16px;border-radius:6px;overflow-x:auto;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;color:#444;margin:16px 0;',
    strong: 'font-weight:700;color:#111;',
    em: 'font-style:italic;color:#555;',
    hr: 'border:none;border-top:1px solid #e5e5e5;margin:28px 0;',
    ul: 'margin:12px 0;padding-left:24px;',
    ol: 'margin:12px 0;padding-left:24px;',
    li: 'margin:6px 0;line-height:1.7;',
    img: 'max-width:100%;height:auto;border-radius:4px;margin:16px 0;display:block;',
    a: 'color:#576b95;text-decoration:none;word-break:break-all;',
  },
  'tech-blue': {
    body: 'margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.8;color:#2c3e50;background:#fff;',
    h1: 'font-size:26px;font-weight:700;color:#1a73e8;margin:32px 0 16px;padding-bottom:10px;border-bottom:2px solid #1a73e8;',
    h2: 'font-size:22px;font-weight:700;color:#1565c0;margin:28px 0 14px;padding-left:12px;border-left:4px solid #1a73e8;',
    h3: 'font-size:18px;font-weight:600;color:#1976d2;margin:24px 0 12px;',
    p: 'margin:0 0 16px;line-height:1.8;',
    blockquote: 'margin:16px 0;padding:12px 20px;border-left:4px solid #1a73e8;background:#e8f0fe;color:#37474f;font-size:15px;border-radius:0 6px 6px 0;',
    code: 'background:#e8f0fe;padding:2px 6px;border-radius:3px;font-family:Menlo,Monaco,Consolas,monospace;font-size:14px;color:#1565c0;',
    codeBlock: 'background:#1e293b;padding:16px;border-radius:8px;overflow-x:auto;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;color:#e2e8f0;margin:16px 0;',
    strong: 'font-weight:700;color:#1a73e8;',
    em: 'font-style:italic;color:#5c6bc0;',
    hr: 'border:none;height:2px;background:linear-gradient(to right,#1a73e8,transparent);margin:28px 0;',
    ul: 'margin:12px 0;padding-left:24px;',
    ol: 'margin:12px 0;padding-left:24px;',
    li: 'margin:6px 0;line-height:1.7;',
    img: 'max-width:100%;height:auto;border-radius:8px;margin:16px 0;display:block;box-shadow:0 2px 12px rgba(26,115,232,0.15);',
    a: 'color:#1a73e8;text-decoration:none;word-break:break-all;border-bottom:1px solid #1a73e8;',
  },
  'warm-orange': {
    body: 'margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.8;color:#3e2723;background:#fff;',
    h1: 'font-size:26px;font-weight:700;color:#e65100;margin:32px 0 16px;padding-bottom:10px;border-bottom:2px solid #ff9800;',
    h2: 'font-size:22px;font-weight:700;color:#ef6c00;margin:28px 0 14px;padding-left:12px;border-left:4px solid #ff9800;',
    h3: 'font-size:18px;font-weight:600;color:#f57c00;margin:24px 0 12px;',
    p: 'margin:0 0 16px;line-height:1.8;',
    blockquote: 'margin:16px 0;padding:12px 20px;border-left:4px solid #ff9800;background:#fff3e0;color:#5d4037;font-size:15px;border-radius:0 6px 6px 0;',
    code: 'background:#fff3e0;padding:2px 6px;border-radius:3px;font-family:Menlo,Monaco,Consolas,monospace;font-size:14px;color:#e65100;',
    codeBlock: 'background:#3e2723;padding:16px;border-radius:8px;overflow-x:auto;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;color:#ffcc80;margin:16px 0;',
    strong: 'font-weight:700;color:#e65100;',
    em: 'font-style:italic;color:#8d6e63;',
    hr: 'border:none;height:2px;background:linear-gradient(to right,#ff9800,transparent);margin:28px 0;',
    ul: 'margin:12px 0;padding-left:24px;',
    ol: 'margin:12px 0;padding-left:24px;',
    li: 'margin:6px 0;line-height:1.7;',
    img: 'max-width:100%;height:auto;border-radius:8px;margin:16px 0;display:block;box-shadow:0 2px 12px rgba(255,152,0,0.15);',
    a: 'color:#e65100;text-decoration:none;word-break:break-all;border-bottom:1px solid #ff9800;',
  },
  'elegant-green': {
    body: 'margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.8;color:#2e3b2e;background:#fff;',
    h1: 'font-size:26px;font-weight:700;color:#2e7d32;margin:32px 0 16px;padding-bottom:10px;border-bottom:2px solid #66bb6a;',
    h2: 'font-size:22px;font-weight:700;color:#388e3c;margin:28px 0 14px;padding-left:12px;border-left:4px solid #66bb6a;',
    h3: 'font-size:18px;font-weight:600;color:#43a047;margin:24px 0 12px;',
    p: 'margin:0 0 16px;line-height:1.8;',
    blockquote: 'margin:16px 0;padding:12px 20px;border-left:4px solid #66bb6a;background:#e8f5e9;color:#3e4e3e;font-size:15px;border-radius:0 6px 6px 0;',
    code: 'background:#e8f5e9;padding:2px 6px;border-radius:3px;font-family:Menlo,Monaco,Consolas,monospace;font-size:14px;color:#2e7d32;',
    codeBlock: 'background:#1b2e1b;padding:16px;border-radius:8px;overflow-x:auto;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;color:#a5d6a7;margin:16px 0;',
    strong: 'font-weight:700;color:#2e7d32;',
    em: 'font-style:italic;color:#689f38;',
    hr: 'border:none;height:2px;background:linear-gradient(to right,#66bb6a,transparent);margin:28px 0;',
    ul: 'margin:12px 0;padding-left:24px;',
    ol: 'margin:12px 0;padding-left:24px;',
    li: 'margin:6px 0;line-height:1.7;',
    img: 'max-width:100%;height:auto;border-radius:8px;margin:16px 0;display:block;box-shadow:0 2px 12px rgba(76,175,80,0.15);',
    a: 'color:#2e7d32;text-decoration:none;word-break:break-all;border-bottom:1px solid #66bb6a;',
  },
  'dark-pro': {
    body: 'margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.8;color:#e0e0e0;background:#1a1a2e;',
    h1: 'font-size:26px;font-weight:700;color:#82b1ff;margin:32px 0 16px;padding-bottom:10px;border-bottom:2px solid #3d5afe;',
    h2: 'font-size:22px;font-weight:700;color:#90caf9;margin:28px 0 14px;padding-left:12px;border-left:4px solid #3d5afe;',
    h3: 'font-size:18px;font-weight:600;color:#80cbc4;margin:24px 0 12px;',
    p: 'margin:0 0 16px;line-height:1.8;',
    blockquote: 'margin:16px 0;padding:12px 20px;border-left:4px solid #3d5afe;background:#16213e;color:#b0bec5;font-size:15px;border-radius:0 6px 6px 0;',
    code: 'background:#16213e;padding:2px 6px;border-radius:3px;font-family:Menlo,Monaco,Consolas,monospace;font-size:14px;color:#80cbc4;',
    codeBlock: 'background:#0f0f23;padding:16px;border-radius:8px;overflow-x:auto;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;color:#a5d6a7;margin:16px 0;border:1px solid #2a2a4a;',
    strong: 'font-weight:700;color:#fff;',
    em: 'font-style:italic;color:#b39ddb;',
    hr: 'border:none;height:2px;background:linear-gradient(to right,#3d5afe,transparent);margin:28px 0;',
    ul: 'margin:12px 0;padding-left:24px;',
    ol: 'margin:12px 0;padding-left:24px;',
    li: 'margin:6px 0;line-height:1.7;',
    img: 'max-width:100%;height:auto;border-radius:8px;margin:16px 0;display:block;box-shadow:0 2px 12px rgba(61,90,254,0.25);',
    a: 'color:#82b1ff;text-decoration:none;word-break:break-all;border-bottom:1px solid #3d5afe;',
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 将 Markdown 转为微信兼容的 inline-style HTML
 */
export function markdownToWechatHtml(md: string, themeId?: string): string {
  const t = THEMES[themeId || 'minimal'] || THEMES.minimal;

  // Normalize line endings
  let text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract fenced code blocks first to protect them
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    codeBlocks.push(escapeHtml(code.trimEnd()));
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
  });

  // Split into lines for block-level parsing
  const lines = text.split('\n');
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block placeholder
    const cbMatch = line.match(/^\x00CODEBLOCK(\d+)\x00$/);
    if (cbMatch) {
      const code = codeBlocks[Number(cbMatch[1])];
      htmlParts.push(`<pre style="${t.codeBlock}"><code>${code}</code></pre>`);
      i++;
      continue;
    }

    // Headings
    const h1 = line.match(/^# (.+)$/);
    if (h1) { htmlParts.push(`<h1 style="${t.h1}">${inlineFormat(h1[1], t)}</h1>`); i++; continue; }
    const h2 = line.match(/^## (.+)$/);
    if (h2) { htmlParts.push(`<h2 style="${t.h2}">${inlineFormat(h2[1], t)}</h2>`); i++; continue; }
    const h3 = line.match(/^### (.+)$/);
    if (h3) { htmlParts.push(`<h3 style="${t.h3}">${inlineFormat(h3[1], t)}</h3>`); i++; continue; }

    // HR
    if (/^---+$/.test(line.trim())) { htmlParts.push(`<hr style="${t.hr}"/>`); i++; continue; }

    // Blockquote (collect consecutive > lines)
    if (/^>\s?/.test(line)) {
      const bqLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      htmlParts.push(`<blockquote style="${t.blockquote}">${inlineFormat(bqLines.join('<br/>'), t)}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[\-\*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-\*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\-\*]\s/, ''));
        i++;
      }
      const lis = items.map(li => `<li style="${t.li}">${inlineFormat(li, t)}</li>`).join('');
      htmlParts.push(`<ul style="${t.ul}">${lis}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      const lis = items.map(li => `<li style="${t.li}">${inlineFormat(li, t)}</li>`).join('');
      htmlParts.push(`<ol style="${t.ol}">${lis}</ol>`);
      continue;
    }

    // Image (standalone line)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      htmlParts.push(`<img style="${t.img}" src="${escapeHtml(imgMatch[2])}" alt="${escapeHtml(imgMatch[1])}"/>`);
      i++;
      continue;
    }

    // Empty line → skip (paragraph separator)
    if (line.trim() === '') { i++; continue; }

    // Regular paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' &&
      !/^#{1,3}\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i]) && !/^[\-\*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) && !/^\x00CODEBLOCK/.test(lines[i]) &&
      !/^!\[/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      htmlParts.push(`<p style="${t.p}">${inlineFormat(paraLines.join('<br/>'), t)}</p>`);
    }
  }

  return `<section style="${t.body}">${htmlParts.join('')}</section>`;
}

/** Apply inline formatting (bold, italic, code, links, images) */
function inlineFormat(text: string, t: ThemeTokens): string {
  return text
    // inline images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<img style="${t.img}" src="$2" alt="$1"/>`)
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a style="${t.a}" href="$2">$1</a>`)
    // bold
    .replace(/\*\*(.+?)\*\*/g, `<strong style="${t.strong}">$1</strong>`)
    // italic
    .replace(/\*(.+?)\*/g, `<em style="${t.em}">$1</em>`)
    // inline code
    .replace(/`(.+?)`/g, `<code style="${t.code}">$1</code>`);
}
