import React, { useRef, useEffect } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';

// Inject minimal editor styles once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .milkdown-editor { outline: none; padding: 12px 16px; min-height: inherit; font-size: 14px; line-height: 1.7; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .milkdown-editor h1 { font-size: 1.6em; font-weight: 700; margin: 0.6em 0 0.4em; }
    .milkdown-editor h2 { font-size: 1.35em; font-weight: 700; margin: 0.5em 0 0.3em; }
    .milkdown-editor h3 { font-size: 1.15em; font-weight: 600; margin: 0.4em 0 0.3em; }
    .milkdown-editor p { margin: 0.4em 0; }
    .milkdown-editor ul, .milkdown-editor ol { padding-left: 1.5em; margin: 0.4em 0; }
    .milkdown-editor li { margin: 0.15em 0; }
    .milkdown-editor code { background: #f3f4f6; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; font-family: 'Fira Code', Consolas, monospace; }
    .milkdown-editor pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 0.5em 0; }
    .milkdown-editor pre code { background: none; padding: 0; }
    .milkdown-editor blockquote { border-left: 3px solid #d1d5db; padding-left: 12px; margin: 0.5em 0; color: #6b7280; }
    .milkdown-editor strong { font-weight: 700; }
    .milkdown-editor em { font-style: italic; }
    .milkdown-editor hr { border: none; border-top: 1px solid #e5e7eb; margin: 1em 0; }
    .milkdown-editor a { color: #2563eb; text-decoration: underline; }
    .milkdown-editor .editor { outline: none; }
    .milkdown .editor { outline: none; }
  `;
  document.head.appendChild(style);
}

interface Props {
  value: string;
  onChange: (md: string) => void;
  minHeight?: number;
}

export const MilkdownEditor: React.FC<Props> = ({ value, onChange, minHeight = 300 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clean up previous editor
    if (editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
    }
    el.innerHTML = '';
    valueRef.current = value;

    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, el);
        ctx.set(defaultValueCtx, value);
        ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
          if (md !== valueRef.current) {
            valueRef.current = md;
            onChange(md);
          }
        });
      })
      .use(commonmark)
      .use(listener)
      .create()
      .then((editor) => {
        editorRef.current = editor;
        // Add class for styling
        const proseMirror = el.querySelector('.ProseMirror');
        if (proseMirror) {
          proseMirror.classList.add('milkdown-editor');
        }
      });

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, [value]); // rebuild on value identity change (item switch)

  return (
    <div
      ref={containerRef}
      className="milkdown"
      style={{
        minHeight,
        border: '1px solid #e2e5e9',
        borderRadius: 8,
        overflow: 'auto',
        backgroundColor: '#fff',
      }}
    />
  );
};
