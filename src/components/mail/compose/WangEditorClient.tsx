'use client';

import '@wangeditor/editor/dist/css/style.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boot, i18nChangeLanguage, type IButtonMenu, type IDomEditor } from '@wangeditor/editor';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';

import { buildFormulaHtml, buildLinkCardHtml, markdownToHtml, safeComposeUrl } from '@/lib/client/compose';
import type { Locale } from '@/lib/i18n';

type EditorApi = {
  getHtml: () => string;
  setHtml: (value: string) => void;
  destroy?: () => void;
  dangerouslyInsertHtml: (html: string) => void;
  insertText: (text: string) => void;
  getText: () => string;
  on?: (event: string, listener: (payload: unknown) => void) => void;
  off?: (event: string, listener: (payload: unknown) => void) => void;
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
    formula: string;
    markdown: string;
    linkCard: string;
    formulaPlaceholder: string;
    markdownPlaceholder: string;
    linkTitlePlaceholder: string;
    description: string;
    close: string;
    insert: string;
  };
  onReady?: (api: {
    insertFormula: (latex: string) => void;
    insertLinkCard: (html: string) => void;
    insertMarkdown: (html: string) => void;
    getHtml: () => string;
    setHtml: (value: string) => void;
  }) => void;
  onEditorMetaChange?: (meta: {
    formula?: string;
    linkCard?: { url: string; title: string; description?: string; imageUrl?: string };
    markdown?: string;
  }) => void;
}

type ComposeAction = 'formula' | 'markdown' | 'linkCard';

const actionListeners = new WeakMap<IDomEditor, (action: ComposeAction) => void>();
let customMenusRegistered = false;
let customMenuMessages: WangEditorClientProps['messages'] | null = null;

const composeMenuIcons: Record<ComposeAction, string> = {
  formula: '<span data-fi-compose-menu-icon="formula">fx</span>',
  markdown: '<span data-fi-compose-menu-icon="markdown">MD</span>',
  linkCard: '<span data-fi-compose-menu-icon="link-card">LC</span>',
};

class ComposeToolbarButton implements IButtonMenu {
  readonly tag = 'button';
  readonly iconSvg: string;
  private readonly action: ComposeAction;

  constructor(action: ComposeAction) {
    this.action = action;
    this.iconSvg = composeMenuIcons[action];
  }

  get title() {
    if (this.action === 'formula') return customMenuMessages?.formula || 'Formula';
    if (this.action === 'markdown') return customMenuMessages?.markdown || 'Markdown';
    return customMenuMessages?.linkCard || 'Link card';
  }

  getValue() {
    return '';
  }

  isActive() {
    return false;
  }

  isDisabled(editor: IDomEditor) {
    return editor.isDisabled();
  }

  exec(editor: IDomEditor) {
    actionListeners.get(editor)?.(this.action);
  }
}

function registerCustomMenus(messages: WangEditorClientProps['messages']) {
  customMenuMessages = messages;
  if (customMenusRegistered) return;
  customMenusRegistered = true;

  Boot.registerMenu({
    key: 'fiFormula',
    factory: () => new ComposeToolbarButton('formula'),
  });
  Boot.registerMenu({
    key: 'fiMarkdown',
    factory: () => new ComposeToolbarButton('markdown'),
  });
  Boot.registerMenu({
    key: 'fiLinkCard',
    factory: () => new ComposeToolbarButton('linkCard'),
  });
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

function clampPanelPosition(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function liftFloatingPanel(modalOrPanel: unknown) {
  const overlay = modalOrPanel as {
    type?: string;
    $elem?: { [index: number]: HTMLElement | undefined };
  };
  if (overlay.type !== 'dropPanel' && overlay.type !== 'selectList') return;

  const panel = overlay.$elem?.[0];
  if (!panel) return;

  requestAnimationFrame(() => {
    if (!panel.isConnected) return;

    const anchor =
      (panel.closest('.w-e-bar-item') as HTMLElement | null) ||
      (panel.closest('.w-e-bar') as HTMLElement | null);
    if (!anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = Math.min(Math.max(panelRect.width || 240, 220), Math.max(220, viewportWidth - 24));
    const panelHeight = Math.min(panelRect.height || 260, Math.max(160, viewportHeight - 24));
    const left = clampPanelPosition(anchorRect.left, 12, viewportWidth - panelWidth - 12);
    const belowTop = anchorRect.bottom + 8;
    const top =
      belowTop + panelHeight <= viewportHeight - 12
        ? belowTop
        : clampPanelPosition(anchorRect.top - panelHeight - 8, 12, viewportHeight - panelHeight - 12);

    Object.assign(panel.style, {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      right: 'auto',
      bottom: 'auto',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: 'calc(100dvh - 24px)',
      overflow: 'auto',
      zIndex: '180',
    });
  });
}

export function WangEditorClient({
  value,
  onChange,
  placeholder,
  locale,
  disabled,
  messages,
  onReady,
  onEditorMetaChange,
}: WangEditorClientProps) {
  const [editor, setEditor] = useState<EditorApi | null>(null);
  const [panelAction, setPanelAction] = useState<ComposeAction | null>(null);
  const [formula, setFormula] = useState('');
  const [markdownInput, setMarkdownInput] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkImageUrl, setLinkImageUrl] = useState('');
  const editorLanguage = getWangEditorLanguage(locale);

  useMemo(() => {
    i18nChangeLanguage(editorLanguage);
  }, [editorLanguage]);

  useMemo(() => registerCustomMenus(messages), [messages]);

  const closePanel = useCallback(() => {
    setPanelAction(null);
  }, []);

  function submitPanel() {
    if (!editor) return;
    if (panelAction === 'formula') {
      const value = formula.trim();
      if (!value) return;
      editor.dangerouslyInsertHtml(buildFormulaHtml(value));
      onEditorMetaChange?.({ formula: value });
      setFormula('');
      closePanel();
      return;
    }

    if (panelAction === 'markdown') {
      const value = markdownInput.trim();
      if (!value) return;
      editor.dangerouslyInsertHtml(markdownToHtml(value));
      onEditorMetaChange?.({ markdown: value });
      setMarkdownInput('');
      closePanel();
      return;
    }

    if (panelAction === 'linkCard') {
      const url = safeComposeUrl(linkUrl);
      if (!url || !linkTitle.trim()) return;
      const linkCard = {
        url,
        title: linkTitle.trim(),
        description: linkDescription.trim() || undefined,
        imageUrl: linkImageUrl.trim() || undefined,
      };
      const html = buildLinkCardHtml(linkCard);
      if (!html) return;
      editor.dangerouslyInsertHtml(html);
      onEditorMetaChange?.({ linkCard });
      setLinkUrl('');
      setLinkTitle('');
      setLinkDescription('');
      setLinkImageUrl('');
      closePanel();
    }
  }

  const toolbarConfig = useMemo(
    () => ({
      toolbarKeys: [
        'headerSelect',
        'blockquote',
        '|',
        'bold',
        'underline',
        'italic',
        'through',
        'code',
        'sup',
        'sub',
        'clearStyle',
        '|',
        'color',
        'bgColor',
        '|',
        'fontSize',
        'fontFamily',
        'lineHeight',
        '|',
        'bulletedList',
        'numberedList',
        'todo',
        '|',
        'justifyLeft',
        'justifyCenter',
        'justifyRight',
        'justifyJustify',
        '|',
        'indent',
        'delIndent',
        '|',
        'emotion',
        'insertLink',
        'insertImage',
        'insertVideo',
        'insertTable',
        'codeBlock',
        'divider',
        '|',
        'fiFormula',
        'fiMarkdown',
        'fiLinkCard',
        '|',
        'undo',
        'redo',
        'fullScreen',
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
      if (editor) {
        actionListeners.delete(editor as unknown as IDomEditor);
      }
      editor?.destroy?.();
    };
  }, [editor]);

  useEffect(() => {
    if (!editor?.on) return;
    editor.on('modalOrPanelShow', liftFloatingPanel);
    return () => {
      editor.off?.('modalOrPanelShow', liftFloatingPanel);
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
          actionListeners.set(instance as unknown as IDomEditor, (action) => setPanelAction(action));
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
      {panelAction ? (
        <div className="fi-editor-dialog-backdrop" role="presentation" onMouseDown={closePanel}>
          <div className="fi-editor-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sm font-semibold">
              {panelAction === 'formula'
                ? messages.formula
                : panelAction === 'markdown'
                  ? messages.markdown
                  : messages.linkCard}
            </div>

            {panelAction === 'formula' ? (
              <textarea
                className="fi-editor-dialog-input min-h-28"
                value={formula}
                placeholder={messages.formulaPlaceholder}
                onChange={(e) => setFormula(e.target.value)}
              />
            ) : null}

            {panelAction === 'markdown' ? (
              <textarea
                className="fi-editor-dialog-input min-h-40"
                value={markdownInput}
                placeholder={messages.markdownPlaceholder}
                onChange={(e) => setMarkdownInput(e.target.value)}
              />
            ) : null}

            {panelAction === 'linkCard' ? (
              <div className="space-y-3">
                <input
                  className="fi-editor-dialog-input"
                  value={linkUrl}
                  placeholder={messages.linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
                <input
                  className="fi-editor-dialog-input"
                  value={linkTitle}
                  placeholder={messages.linkTitlePlaceholder}
                  onChange={(e) => setLinkTitle(e.target.value)}
                />
                <input
                  className="fi-editor-dialog-input"
                  value={linkDescription}
                  placeholder={messages.description}
                  onChange={(e) => setLinkDescription(e.target.value)}
                />
                <input
                  className="fi-editor-dialog-input"
                  value={linkImageUrl}
                  placeholder={messages.imageUrl}
                  onChange={(e) => setLinkImageUrl(e.target.value)}
                />
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="fi-editor-dialog-button" onClick={closePanel}>
                {messages.close}
              </button>
              <button type="button" className="fi-editor-dialog-button primary" onClick={submitPanel}>
                {messages.insert}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
