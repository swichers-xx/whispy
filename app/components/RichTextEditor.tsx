'use client';

import React, { useState, useRef, useEffect } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (text: string, isFormatted: boolean) => void;
  placeholder?: string;
  className?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Type a message...',
  className = ''
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFormatted, setIsFormatted] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);

  // Initialize editor with value
  useEffect(() => {
    if (editorRef.current && value === '') {
      editorRef.current.innerHTML = '';
    }
  }, [value]);

  // Add CSS for placeholder
  useEffect(() => {
    // Add a style tag for the placeholder if it doesn't exist
    if (!document.getElementById('rich-text-editor-styles')) {
      const style = document.createElement('style');
      style.id = 'rich-text-editor-styles';
      style.innerHTML = `
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #a0aec0;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      // Check if content has any formatting
      const hasFormatting = html !== editorRef.current.innerText;
      setIsFormatted(hasFormatting);
      onChange(html, hasFormatting);
    }
  };

  const execCommand = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
      handleInput();
    }
  };

  return (
    <div className="rich-text-editor w-full">
      {showToolbar && (
        <div className="toolbar flex bg-gray-800 rounded-t-lg p-1 space-x-1 border-b border-gray-700">
          <button
            type="button"
            onClick={() => execCommand('bold')}
            className="p-1 hover:bg-gray-700 rounded"
            title="Bold"
          >
            <span className="font-bold">B</span>
          </button>
          <button
            type="button"
            onClick={() => execCommand('italic')}
            className="p-1 hover:bg-gray-700 rounded"
            title="Italic"
          >
            <span className="italic">I</span>
          </button>
          <button
            type="button"
            onClick={() => execCommand('underline')}
            className="p-1 hover:bg-gray-700 rounded"
            title="Underline"
          >
            <span className="underline">U</span>
          </button>
          <button
            type="button"
            onClick={() => execCommand('strikeThrough')}
            className="p-1 hover:bg-gray-700 rounded"
            title="Strike through"
          >
            <span className="line-through">S</span>
          </button>
          <span className="border-l border-gray-600 mx-1"></span>
          <button
            type="button"
            onClick={() => execCommand('insertOrderedList')}
            className="p-1 hover:bg-gray-700 rounded"
            title="Numbered list"
          >
            1.
          </button>
          <button
            type="button"
            onClick={() => execCommand('insertUnorderedList')}
            className="p-1 hover:bg-gray-700 rounded"
            title="Bullet list"
          >
            •
          </button>
          <span className="border-l border-gray-600 mx-1"></span>
          <button
            type="button"
            onClick={() => {
              const url = prompt('Enter link URL:');
              if (url) execCommand('createLink', url);
            }}
            className="p-1 hover:bg-gray-700 rounded"
            title="Insert link"
          >
            🔗
          </button>
          <button
            type="button"
            onClick={() => execCommand('removeFormat')}
            className="p-1 hover:bg-gray-700 rounded"
            title="Clear formatting"
          >
            ✕
          </button>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        className={`${className} ${
          showToolbar ? 'rounded-b-lg' : 'rounded-lg'
        } min-h-[40px] max-h-[200px] overflow-y-auto`}
        onInput={handleInput}
        onFocus={() => setShowToolbar(true)}
        onBlur={() => {
          // Small delay to allow toolbar button clicks to register
          setTimeout(() => setShowToolbar(false), 200);
        }}
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    </div>
  );
};

export default RichTextEditor;
