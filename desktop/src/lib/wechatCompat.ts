// WeChat compatibility layer for copy/publish
// Adapted from raphael-publish (MIT licensed)
import { THEMES } from './themes';

async function getBase64Image(imgUrl: string): Promise<string> {
  try {
    if (imgUrl.startsWith('data:')) return imgUrl;
    const response = await fetch(imgUrl, { mode: 'cors', cache: 'default' });
    if (!response.ok) return imgUrl;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(imgUrl);
      reader.readAsDataURL(blob);
    });
  } catch {
    return imgUrl;
  }
}

export async function makeWeChatCompatible(html: string, themeId: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const containerStyle = theme.styles.container || '';

  // 1. Convert root div to section (WeChat prefers section)
  const rootNodes = Array.from(doc.body.children);
  const section = doc.createElement('section');
  section.setAttribute('style', containerStyle);

  rootNodes.forEach(node => {
    if (node.tagName === 'DIV' && rootNodes.length === 1) {
      Array.from(node.childNodes).forEach(child => section.appendChild(child));
    } else {
      section.appendChild(node);
    }
  });

  // 2. Flex → Table conversion (WeChat ignores flex)
  section.querySelectorAll('div, p.image-grid').forEach(node => {
    if (node.closest('pre, code')) return;
    const style = node.getAttribute('style') || '';
    const isFlexNode = style.includes('display: flex') || style.includes('display:flex');
    const isImageGrid = node.classList.contains('image-grid');
    if (!isFlexNode && !isImageGrid) return;

    const flexChildren = Array.from(node.children);
    if (flexChildren.every(child => child.tagName === 'IMG' || child.querySelector('img'))) {
      const table = doc.createElement('table');
      table.setAttribute('style', 'width: 100%; border-collapse: collapse; margin: 16px 0; border: none !important;');
      const tbody = doc.createElement('tbody');
      const tr = doc.createElement('tr');
      tr.setAttribute('style', 'border: none !important; background: transparent !important;');
      flexChildren.forEach(child => {
        const td = doc.createElement('td');
        td.setAttribute('style', 'padding: 0 4px; vertical-align: top; border: none !important; background: transparent !important;');
        td.appendChild(child);
        if (child.tagName === 'IMG') {
          const cs = child.getAttribute('style') || '';
          child.setAttribute('style', cs.replace(/width:\s*[^;]+;?/g, '') + ' width: 100% !important; display: block; margin: 0 auto;');
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
      table.appendChild(tbody);
      node.parentNode?.replaceChild(table, node);
    } else if (isFlexNode) {
      node.setAttribute('style', style.replace(/display:\s*flex;?/g, 'display: block;'));
    }
  });

  // 3. Flatten <p> inside <li>
  section.querySelectorAll('li').forEach(li => {
    li.querySelectorAll('p').forEach(p => {
      const span = doc.createElement('span');
      span.innerHTML = p.innerHTML;
      const pStyle = p.getAttribute('style');
      if (pStyle) span.setAttribute('style', pStyle);
      p.parentNode?.replaceChild(span, p);
    });
  });

  // 4. Force inheritance of container font properties
  const fontMatch = containerStyle.match(/font-family:\s*([^;]+);/);
  const sizeMatch = containerStyle.match(/font-size:\s*([^;]+);/);
  const colorMatch = containerStyle.match(/color:\s*([^;]+);/);
  const lineHeightMatch = containerStyle.match(/line-height:\s*([^;]+);/);

  section.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, span').forEach(node => {
    if (node.tagName === 'SPAN' && node.closest('pre, code')) return;
    let cs = node.getAttribute('style') || '';
    if (fontMatch && !cs.includes('font-family:')) cs += ` font-family: ${fontMatch[1]};`;
    if (lineHeightMatch && !cs.includes('line-height:')) cs += ` line-height: ${lineHeightMatch[1]};`;
    if (sizeMatch && !cs.includes('font-size:') && ['P', 'LI', 'BLOCKQUOTE', 'SPAN'].includes(node.tagName))
      cs += ` font-size: ${sizeMatch[1]};`;
    if (colorMatch && !cs.includes('color:')) cs += ` color: ${colorMatch[1]};`;
    node.setAttribute('style', cs.trim());
  });

  // 5. CJK punctuation reattachment
  section.querySelectorAll('strong, b, em, span, a, code').forEach(node => {
    const next = node.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE) return;
    const text = next.textContent || '';
    const match = text.match(/^\s*([：；，。！？、:])(.*)$/s);
    if (!match) return;
    node.appendChild(doc.createTextNode(match[1]));
    if (match[2]) { next.textContent = match[2]; }
    else { next.parentNode?.removeChild(next); }
  });

  // 6. Convert images to Base64
  const imgs = Array.from(section.querySelectorAll('img'));
  await Promise.all(imgs.map(async img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:')) {
      img.setAttribute('src', await getBase64Image(src));
    }
  }));

  doc.body.innerHTML = '';
  doc.body.appendChild(section);

  let outputHtml = doc.body.innerHTML;
  outputHtml = outputHtml.replace(/(<\/(?:strong|b|em|span|a|code)>)\s*([：；，。！？、])/g, '$1\u2060$2');
  return outputHtml;
}
