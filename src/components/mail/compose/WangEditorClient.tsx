'use client';

import '@wangeditor/editor/dist/css/style.css';

import { useEffect, useMemo, useState } from 'react';
import { i18nChangeLanguage } from '@wangeditor/editor';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';

import { buildFormulaHtml, safeComposeUrl } from '@/lib/client/compose';
import type { Locale } from '@/lib/i18n';

type EditorApi = {
  getHtml: () => string;
  setHtml: (value: string) => void;
  destroy?: () => void;
  dangerouslyInsertHtml: (html: string) => void;
  insertText: (text: string) => void;
  getText: () => string;
};

interface WangEditorClientProps {
  value: string;
  onChange: (value: string, meta: { textLength: number; markdown: string }) => void;
  placeholder: string;
  locale: Locale;
  disabled?: boolean;
  messages: {
    imageUrl: string;
    linkUrl: string;
    videoUrl: string;
  };
  onReady?: (api: {
    insertFormula: (latex: string) => void;
    insertLinkCard: (html: string) => void;
    insertMarkdown: (html: string) => void;
    getHtml: () => string;
    setHtml: (value: string) => void;
  }) => void;
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWangEditorLanguage(locale: Locale): 'zh-CN' | 'en' {
  return locale === 'zh-CN' || locale === 'zh-TW' ? 'zh-CN' : 'en';
}

export function WangEditorClient({
  value,
  onChange,
  placeholder,
  locale,
  disabled,
  messages,
  onReady,
}: WangEditorClientProps) {
  const [editor, setEditor] = useState<EditorApi | null>(null);
  const editorLanguage = getWangEditorLanguage(locale);

  useEffect(() => {
    i18nChangeLanguage(editorLanguage);
  }, [editorLanguage]);

  const toolbarConfig = useMemo(
    () => ({
      toolbarKeys: [
        'undo',
        'redo',
        '|',
        'bold',
        'italic',
        'underline',
        'through',
        'clearStyle',
        '|',
        'color',
        'bgColor',
        '|',
        'bulletedList',
        'numberedList',
        'blockquote',
        'codeBlock',
        '|',
        'insertLink',
        'insertImage',
        'insertVideo',
      ],
      excludeKeys: ['uploadImage', 'uploadVideo'],
      modalAppendToBody: true,
    }),
    []
  );

  const editorConfig = useMemo(
    () => ({
      placeholder,
      readOnly: !!disabled,
      maxLength: 3000,
      scroll: true,
      hoverbarKeys: {
        text: { menuKeys: ['bold', 'insertLink'] },
        link: { menuKeys: ['editLink', 'unLink', 'viewLink'] },
        image: { menuKeys: ['editImage', 'viewImageLink', 'deleteImage'] },
      },
      MENU_CONF: {
        insertImage: {
          checkImage(src: string) {
            return !!safeComposeUrl(src) || messages.imageUrl;
          },
          parseImageSrc(src: string) {
            return safeComposeUrl(src) || src;
          },
        },
        insertLink: {
          checkLink(_: string, url: string) {
            return !!safeComposeUrl(url) || messages.linkUrl;
          },
          parseLinkUrl(url: string) {
            return safeComposeUrl(url) || url;
          },
        },
        editLink: {
          checkLink(_: string, url: string) {
            return !!safeComposeUrl(url) || messages.linkUrl;
          },
          parseLinkUrl(url: string) {
            return safeComposeUrl(url) || url;
          },
        },
        insertVideo: {
          checkVideo(src: string) {
            return !!safeComposeUrl(src) || messages.videoUrl;
          },
        },
      },
    }),
    [disabled, messages.imageUrl, messages.linkUrl, messages.videoUrl, placeholder]
  );

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHtml()) {
      editor.setHtml(value);
    }
  }, [editor, value]);

  useEffect(() => {
    return () => {
      editor?.destroy?.();
    };
  }, [editor]);

  return (
    <div className="fi-compose-editor fi-compose-scrollbar">
      <Toolbar editor={editor as never} defaultConfig={toolbarConfig as never} mode="default" />
      <Editor
        defaultConfig={editorConfig as never}
        value={value}
        onCreated={(instance) => {
          setEditor(instance as EditorApi);
          onReady?.({
            insertFormula(latex: string) {
              if (!latex.trim()) return;
              (instance as unknown as EditorApi).dangerouslyInsertHtml(buildFormulaHtml(latex));
            },
            insertLinkCard(html: string) {
              if (!html.trim()) return;
              (instance as unknown as EditorApi).dangerouslyInsertHtml(html);
            },
            insertMarkdown(html: string) {
              if (!html.trim()) return;
              (instance as unknown as EditorApi).dangerouslyInsertHtml(html);
            },
            getHtml() {
              return (instance as unknown as EditorApi).getHtml();
            },
            setHtml(nextValue: string) {
              (instance as unknown as EditorApi).setHtml(nextValue);
            },
          });
        }}
        onChange={(instance) => {
          const editorInstance = instance as unknown as EditorApi;
          const html = editorInstance.getHtml();
          const text = editorInstance.getText().replace(/[\r\n]+/g, '');
          onChange(html, { textLength: text.length, markdown: htmlToMarkdown(html) });
        }}
        mode="default"
      />
    </div>
  );
}
