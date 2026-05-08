'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { DomEditor, i18nChangeLanguage, SlateEditor, SlateElement, SlateRange, SlateTransforms } from '@wangeditor/editor';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';

import { buildFormulaHtml, buildLinkCardHtml, escapeHtml, markdownToHtml, safeComposeUrl } from '@/lib/client/compose';
import type { Locale } from '@/lib/i18n';

type EditorApi = {
  getHtml: () => string;
  setHtml: (value: string) => void;
  destroy?: () => void;
  dangerouslyInsertHtml: (html: string) => void;
  insertText: (text: string) => void;
  insertNode: (node: unknown) => void;
  getText: () => string;
  restoreSelection?: () => void;
  focus?: () => void;
  updateView?: () => void;
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
    image: string;
    video: string;
    table: string;
    rows: string;
    columns: string;
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

type ComposeAction = 'formula' | 'markdown' | 'linkCard' | 'image' | 'video' | 'table';
type HeaderType = 'paragraph' | 'header1' | 'header2' | 'header3';
type SavedSelection = {
  anchor: { path: number[]; offset: number };
  focus: { path: number[]; offset: number };
};

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

function normalizeImageUrl(value: string): string {
  return safeComposeUrl(value) || '';
}

function extractAttribute(value: string, attribute: string): string {
  const pattern = new RegExp(`${attribute}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  return value.match(pattern)?.[2] || '';
}

function extractIframeSrc(value: string): string {
  const trimmed = value.trim();
  if (!/^<iframe[\s>]/i.test(trimmed)) return '';
  return extractAttribute(trimmed, 'src');
}

function normalizeVideoSource(value: string): string {
  const trimmed = value.trim();
  const iframeSrc = extractIframeSrc(trimmed);
  const src = safeComposeUrl(iframeSrc || trimmed);
  if (!src) return '';

  const host = new URL(src).hostname.toLowerCase();
  if (
    iframeSrc &&
    (host === 'player.bilibili.com' ||
      host.endsWith('.bilibili.com') ||
      host.endsWith('.youtube.com') ||
      host === 'www.youtube.com')
  ) {
    return `<iframe src="${escapeHtml(src)}" frameborder="0" allowfullscreen></iframe>`;
  }

  return src;
}

function ensureBlockHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  return `${trimmed}<p><br></p>`;
}

function buildTableNode(rows: number, columns: number) {
  return {
    type: 'table',
    width: 'auto',
    children: Array.from({ length: rows }, (_, rowIndex) => ({
      type: 'table-row',
      children: Array.from({ length: columns }, () => ({
        type: 'table-cell',
        isHeader: rowIndex === 0,
        children: [{ text: '' }],
      })),
    })),
  };
}

function insertParagraphAfter(editor: EditorApi) {
  editor.insertNode({ type: 'paragraph', children: [{ text: '' }] });
}

function cloneSelection(selection: SlateRange | null | undefined): SavedSelection | null {
  if (!selection) return null;
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    focus: { path: [...selection.focus.path], offset: selection.focus.offset },
  };
}

function restoreSelection(editor: EditorApi, selection: SavedSelection | null) {
  if (selection) {
    SlateTransforms.select(editor as unknown as SlateEditor, selection);
  } else {
    editor.restoreSelection?.();
  }
}

function setBlockType(editor: EditorApi, type: HeaderType, selection: SavedSelection | null) {
  restoreSelection(editor, selection);
  editor.restoreSelection?.();
  editor.focus?.();
  SlateTransforms.setNodes<SlateElement>(
    editor as unknown as SlateEditor,
    { type } as Partial<SlateElement>,
    {
      match: (node) => {
        const nodeType = DomEditor.getNodeType(node);
        return nodeType === 'paragraph' || nodeType.startsWith('header');
      },
      mode: 'highest',
    }
  );
  editor.updateView?.();
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
      zIndex: '70',
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
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [tableRows, setTableRows] = useState('3');
  const [tableColumns, setTableColumns] = useState('3');
  const lastEmittedHtmlRef = useRef(value);
  const savedSelectionRef = useRef<SavedSelection | null>(null);
  const editorLanguage = getWangEditorLanguage(locale);

  useMemo(() => {
    i18nChangeLanguage(editorLanguage);
  }, [editorLanguage]);

  const closePanel = useCallback(() => {
    setPanelAction(null);
  }, []);

  const saveCurrentSelection = useCallback(() => {
    if (!editor) return;
    const selection = (editor as unknown as SlateEditor).selection;
    savedSelectionRef.current = cloneSelection(selection);
  }, [editor]);

  const keepEditorSelection = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      saveCurrentSelection();
    },
    [saveCurrentSelection]
  );

  const openPanel = useCallback(
    (action: ComposeAction) => {
      saveCurrentSelection();
      editor?.focus?.();
      setPanelAction(action);
    },
    [editor, saveCurrentSelection]
  );

  const insertHtmlAtSelection = useCallback(
    (html: string) => {
      if (!editor || !html.trim()) return;
      restoreSelection(editor, savedSelectionRef.current);
      editor.dangerouslyInsertHtml(ensureBlockHtml(html));
      editor.focus?.();
      editor.updateView?.();
    },
    [editor]
  );

  const insertNodeAtSelection = useCallback(
    (node: unknown) => {
      if (!editor) return;
      restoreSelection(editor, savedSelectionRef.current);
      editor.insertNode(node);
      insertParagraphAfter(editor);
      editor.focus?.();
      editor.updateView?.();
    },
    [editor]
  );

  function submitPanel() {
    if (!editor) return;
    if (panelAction === 'formula') {
      const value = formula.trim();
      if (!value) return;
      insertHtmlAtSelection(buildFormulaHtml(value));
      onEditorMetaChange?.({ formula: value });
      setFormula('');
      closePanel();
      return;
    }

    if (panelAction === 'markdown') {
      const value = markdownInput.trim();
      if (!value) return;
      insertHtmlAtSelection(markdownToHtml(value));
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
      insertHtmlAtSelection(html);
      onEditorMetaChange?.({ linkCard });
      setLinkUrl('');
      setLinkTitle('');
      setLinkDescription('');
      setLinkImageUrl('');
      closePanel();
      return;
    }

    if (panelAction === 'image') {
      const src = normalizeImageUrl(imageUrl);
      if (!src) return;
      insertNodeAtSelection({
        type: 'image',
        src,
        alt: imageAlt.trim(),
        href: '',
        children: [{ text: '' }],
      });
      setImageUrl('');
      setImageAlt('');
      closePanel();
      return;
    }

    if (panelAction === 'video') {
      const src = normalizeVideoSource(videoUrl);
      if (!src) return;
      insertNodeAtSelection({ type: 'video', src, children: [{ text: '' }] });
      setVideoUrl('');
      closePanel();
      return;
    }

    if (panelAction === 'table') {
      const rows = Math.min(Math.max(Number.parseInt(tableRows, 10) || 0, 1), 12);
      const columns = Math.min(Math.max(Number.parseInt(tableColumns, 10) || 0, 1), 8);
      insertNodeAtSelection(buildTableNode(rows, columns));
      setTableRows(String(rows));
      setTableColumns(String(columns));
      closePanel();
    }
  }

  const toolbarConfig = useMemo(
    () => ({
      toolbarKeys: [
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
        'codeBlock',
        'divider',
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
        text: {
          menuKeys: [
            'bold',
            'italic',
            'code',
            'color',
            'bgColor',
            'insertLink',
            'clearStyle',
          ],
        },
        link: { menuKeys: ['editLink', 'unLink', 'viewLink'] },
        image: { menuKeys: ['editImage', 'deleteImage'] },
      },
      MENU_CONF: {
        insertImage: {
          checkImage(src: string, _alt: string, url: string) {
            if (!normalizeImageUrl(src)) return messages.imageUrl;
            if (url && !normalizeImageUrl(url)) return messages.linkUrl;
            return true;
          },
          parseImageSrc(src: string) {
            return normalizeImageUrl(src);
          },
          onInsertedImage(imageNode: { url?: string; href?: string } | null) {
            if (!imageNode) return;
            imageNode.url = '';
            imageNode.href = '';
          },
        },
        editImage: {
          checkImage(src: string, _alt: string, url: string) {
            if (!normalizeImageUrl(src)) return messages.imageUrl;
            if (url && !normalizeImageUrl(url)) return messages.linkUrl;
            return true;
          },
          parseImageSrc(src: string) {
            return normalizeImageUrl(src);
          },
          onUpdatedImage(imageNode: { url?: string; href?: string } | null) {
            if (!imageNode) return;
            imageNode.url = '';
            imageNode.href = '';
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
            return !!normalizeVideoSource(src) || messages.videoUrl;
          },
          parseVideoSrc(src: string) {
            return normalizeVideoSource(src);
          },
        },
      },
    }),
    [disabled, messages.imageUrl, messages.linkUrl, messages.videoUrl, placeholder]
  );

  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedHtmlRef.current && value !== editor.getHtml()) {
      editor.setHtml(value);
    }
  }, [editor, value]);

  useEffect(() => {
    return () => {
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
      <div className="fi-compose-actionbar" aria-label="Compose inserts">
        <div className="fi-compose-heading-group" aria-label="Heading level">
          {[
            ['paragraph', 'P'],
            ['header1', 'H1'],
            ['header2', 'H2'],
            ['header3', 'H3'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="fi-compose-heading-action"
              title={label}
              onMouseDown={keepEditorSelection}
              onClick={() => editor && setBlockType(editor, value as HeaderType, savedSelectionRef.current)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="fi-compose-action" title={messages.formula} onMouseDown={keepEditorSelection} onClick={() => openPanel('formula')}>
          <Icon icon="mdi:function-variant" className="h-4 w-4" />
          <span>{messages.formula}</span>
        </button>
        <button type="button" className="fi-compose-action" title={messages.markdown} onMouseDown={keepEditorSelection} onClick={() => openPanel('markdown')}>
          <Icon icon="mdi:language-markdown" className="h-4 w-4" />
          <span>{messages.markdown}</span>
        </button>
        <button type="button" className="fi-compose-action" title={messages.linkCard} onMouseDown={keepEditorSelection} onClick={() => openPanel('linkCard')}>
          <Icon icon="mdi:card-link" className="h-4 w-4" />
          <span>{messages.linkCard}</span>
        </button>
        <button type="button" className="fi-compose-action" title={messages.image} onMouseDown={keepEditorSelection} onClick={() => openPanel('image')}>
          <Icon icon="mdi:image-plus" className="h-4 w-4" />
          <span>{messages.image}</span>
        </button>
        <button type="button" className="fi-compose-action" title={messages.video} onMouseDown={keepEditorSelection} onClick={() => openPanel('video')}>
          <Icon icon="mdi:video-plus" className="h-4 w-4" />
          <span>{messages.video}</span>
        </button>
        <button type="button" className="fi-compose-action" title={messages.table} onMouseDown={keepEditorSelection} onClick={() => openPanel('table')}>
          <Icon icon="mdi:table-plus" className="h-4 w-4" />
          <span>{messages.table}</span>
        </button>
      </div>
      <Toolbar editor={editor as never} defaultConfig={toolbarConfig as never} mode="default" />
      <Editor
        defaultConfig={editorConfig as never}
        defaultHtml={value}
        onCreated={(instance) => {
          setEditor(instance as EditorApi);
          onReady?.({
            insertFormula(latex: string) {
              if (!latex.trim()) return;
              (instance as unknown as EditorApi).restoreSelection?.();
              (instance as unknown as EditorApi).dangerouslyInsertHtml(buildFormulaHtml(latex));
            },
            insertLinkCard(html: string) {
              if (!html.trim()) return;
              (instance as unknown as EditorApi).restoreSelection?.();
              (instance as unknown as EditorApi).dangerouslyInsertHtml(html);
            },
            insertMarkdown(html: string) {
              if (!html.trim()) return;
              (instance as unknown as EditorApi).restoreSelection?.();
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
          lastEmittedHtmlRef.current = html;
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
                  : panelAction === 'linkCard'
                    ? messages.linkCard
                    : panelAction === 'image'
                      ? messages.image
                      : panelAction === 'video'
                        ? messages.video
                        : messages.table}
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

            {panelAction === 'image' ? (
              <div className="space-y-3">
                <input
                  className="fi-editor-dialog-input"
                  value={imageUrl}
                  placeholder={messages.imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <input
                  className="fi-editor-dialog-input"
                  value={imageAlt}
                  placeholder={messages.description}
                  onChange={(e) => setImageAlt(e.target.value)}
                />
              </div>
            ) : null}

            {panelAction === 'video' ? (
              <textarea
                className="fi-editor-dialog-input min-h-28"
                value={videoUrl}
                placeholder={messages.videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            ) : null}

            {panelAction === 'table' ? (
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="fi-editor-dialog-input"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  type="number"
                  value={tableRows}
                  placeholder={messages.rows}
                  onChange={(e) => setTableRows(e.target.value)}
                />
                <input
                  className="fi-editor-dialog-input"
                  inputMode="numeric"
                  min={1}
                  max={8}
                  type="number"
                  value={tableColumns}
                  placeholder={messages.columns}
                  onChange={(e) => setTableColumns(e.target.value)}
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
