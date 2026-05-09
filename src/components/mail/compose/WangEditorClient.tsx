'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Boot,
  DomEditor,
  SlateEditor,
  SlateElement,
  SlateRange,
  SlateTransforms,
  i18nChangeLanguage,
  t as wangEditorT,
  type IButtonMenu,
  type IDomEditor,
  type ISelectMenu,
} from '@wangeditor/editor';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import { h } from 'snabbdom';

import { buildLinkCardHtml, safeComposeUrl } from '@/lib/client/compose';
import type { Locale } from '@/lib/i18n';

type EditorApi = {
  getHtml: () => string;
  setHtml: (value: string) => void;
  destroy?: () => void;
  getText: () => string;
  restoreSelection?: () => void;
  focus?: () => void;
  updateView?: () => void;
  hidePanelOrModal?: () => void;
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
    getHtml: () => string;
    setHtml: (value: string) => void;
  }) => void;
  onEditorMetaChange?: (meta: {
    linkCard?: { url: string; title: string; description?: string; imageUrl?: string };
  }) => void;
}

type ComposeAction = 'linkCard' | 'table';
type HeaderType = 'header1' | 'header2' | 'header3' | 'header4' | 'header5' | 'paragraph';
type LinkCardElement = {
  type: 'fi-link-card';
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
  children: [{ text: '' }];
};
type TableElement = {
  type: 'table';
  width: 'auto';
  children: Array<{
    type: 'table-row';
    children: Array<{
      type: 'table-cell';
      isHeader?: boolean;
      children: [{ text: '' }];
    }>;
  }>;
};
type SavedSelection = {
  anchor: { path: number[]; offset: number };
  focus: { path: number[]; offset: number };
};

const actionListeners = new WeakMap<IDomEditor, (action: ComposeAction) => void>();
let customEditorRegistered = false;
let customMenuMessages: WangEditorClientProps['messages'] | null = null;

const headerTypes: HeaderType[] = ['header1', 'header2', 'header3', 'header4', 'header5'];

function isHeaderType(value: string): value is HeaderType {
  return value === 'paragraph' || headerTypes.includes(value as HeaderType);
}

function isTextBlockElement(node: unknown): node is SlateElement & { type: HeaderType } {
  if (!SlateElement.isElement(node)) return false;
  const type = (node as { type?: unknown }).type;
  return typeof type === 'string' && isHeaderType(type);
}

function editorLanguageText() {
  return wangEditorT('header.text') || 'Text';
}

class HeaderSelectMenu implements ISelectMenu {
  readonly tag = 'select';
  readonly iconSvg =
    '<svg viewBox="0 0 24 24"><path d="M5 4h2v6h10V4h2v16h-2v-8H7v8H5V4z"></path></svg>';
  readonly width = 60;
  readonly selectPanelWidth = 112;

  get title() {
    return wangEditorT('header.title') || 'Header';
  }

  getOptions(editor: IDomEditor) {
    const current = this.getValue(editor).toString();
    return [
      { value: 'header1', text: 'H1', styleForRenderMenuList: { 'font-size': '32px', 'font-weight': '700' } },
      { value: 'header2', text: 'H2', styleForRenderMenuList: { 'font-size': '24px', 'font-weight': '700' } },
      { value: 'header3', text: 'H3', styleForRenderMenuList: { 'font-size': '18px', 'font-weight': '700' } },
      { value: 'header4', text: 'H4', styleForRenderMenuList: { 'font-size': '16px', 'font-weight': '700' } },
      { value: 'header5', text: 'H5', styleForRenderMenuList: { 'font-size': '13px', 'font-weight': '700' } },
      { value: 'paragraph', text: editorLanguageText() },
    ].map((option) => ({ ...option, selected: option.value === current || undefined }));
  }

  getValue(editor: IDomEditor) {
    const entry = SlateEditor.nodes(editor, {
      match: isTextBlockElement,
      universal: true,
      mode: 'highest',
    }).next().value;
    if (!entry) return 'paragraph';
    const node = entry[0];
    return isTextBlockElement(node) ? node.type : 'paragraph';
  }

  isActive() {
    return false;
  }

  isDisabled(editor: IDomEditor) {
    if (editor.isDisabled() || !editor.selection) return true;
    const entry = SlateEditor.nodes(editor, {
      match: isTextBlockElement,
      universal: true,
      mode: 'highest',
    }).next().value;
    return !entry;
  }

  exec(editor: IDomEditor, value: string | boolean) {
    const type = typeof value === 'string' && isHeaderType(value) ? value : 'paragraph';
    SlateTransforms.setNodes(
      editor,
      { type } as never,
      {
        match: isTextBlockElement,
        mode: 'highest',
      }
    );
    editor.focus();
  }
}

class LinkCardToolbarButton implements IButtonMenu {
  readonly tag = 'button';
  readonly iconSvg =
    '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4v-2H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2H7c-1.71.2-3.1-1.19-3.1-2.9zm4.1 1h8v-2H8v2zm9-6.1h-4v2h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5.2-5-5.2z"></path></svg>';

  get title() {
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
    actionListeners.get(editor)?.('linkCard');
  }
}

class TableToolbarButton implements IButtonMenu {
  readonly tag = 'button';
  readonly iconSvg =
    '<svg viewBox="0 0 24 24"><path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 5h14V5H5v3zm0 2v4h4v-4H5zm6 0v4h8v-4h-8zm-6 6v3h4v-3H5zm6 0v3h8v-3h-8z"></path></svg>';

  get title() {
    return customMenuMessages?.table || 'Table';
  }

  getValue() {
    return '';
  }

  isActive() {
    return false;
  }

  isDisabled(editor: IDomEditor) {
    if (editor.isDisabled() || !editor.selection || !SlateRange.isCollapsed(editor.selection)) return true;
    return DomEditor.getSelectedElems(editor).some((elem) => {
      const nodeType = DomEditor.getNodeType(elem);
      return nodeType === 'pre' || nodeType === 'table' || nodeType === 'list-item' || editor.isVoid(elem);
    });
  }

  exec(editor: IDomEditor) {
    actionListeners.get(editor)?.('table');
  }
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

function normalizeImageUrl(value: string): string {
  return safeComposeUrl(value) || '';
}

function cloneSelection(selection: SlateRange | null | undefined): SavedSelection | null {
  if (!selection) return null;
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    focus: { path: [...selection.focus.path], offset: selection.focus.offset },
  };
}

function restoreEditorSelection(editor: EditorApi, selection: SavedSelection | null) {
  if (selection) {
    try {
      SlateTransforms.select(editor as unknown as IDomEditor, selection);
      return;
    } catch {
      editor.restoreSelection?.();
    }
    return;
  }
  editor.restoreSelection?.();
}

function toLinkCardNode(input: {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
}): LinkCardElement {
  return {
    type: 'fi-link-card',
    url: input.url,
    title: input.title,
    description: input.description,
    imageUrl: input.imageUrl,
    children: [{ text: '' }],
  };
}

function toTableNode(rows: number, columns: number): TableElement {
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

function renderLinkCardElement(elemNode: LinkCardElement) {
  const image =
    elemNode.imageUrl && normalizeImageUrl(elemNode.imageUrl)
      ? h('img.fi-link-card__image', { props: { src: elemNode.imageUrl, alt: '' } })
      : h('span.fi-link-card__image.fi-link-card__icon', { attrs: { 'aria-hidden': 'true' } });

  const bodyChildren = elemNode.description
    ? [h('strong', elemNode.title), h('span', elemNode.description)]
    : [h('strong', elemNode.title)];

  return h(
    'div',
    {
      props: { contentEditable: false },
      on: { mousedown: (event: MouseEvent) => event.preventDefault() },
    },
    [
      h(
        'a.fi-link-card',
        {
          props: { href: elemNode.url, target: '_blank', rel: 'noopener noreferrer' },
          attrs: { 'data-fi-link-card': '1' },
        },
        [image, h('span.fi-link-card__body', bodyChildren)]
      ),
    ]
  );
}

function elemToLinkCardHtml(elemNode: LinkCardElement): string {
  return buildLinkCardHtml({
    url: elemNode.url,
    title: elemNode.title,
    description: elemNode.description,
    imageUrl: elemNode.imageUrl,
  });
}

function parseLinkCardHtml(elem: {
  attr: (name: string) => string | undefined;
  find: (selector: string) => {
    attr: (name: string) => string | undefined;
    text: () => string;
  };
  text: () => string;
}): LinkCardElement {
  const url = safeComposeUrl(elem.attr('href') || '') || '';
  const imageUrl = normalizeImageUrl(elem.find('.fi-link-card__image').attr('src') || '');
  const title = elem.find('strong').text().trim() || elem.text().trim() || url;
  const description = elem.find('.fi-link-card__body span').text().trim();
  return toLinkCardNode({
    url,
    title,
    description: description || undefined,
    imageUrl: imageUrl || undefined,
  });
}

function registerCustomEditor(messages: WangEditorClientProps['messages']) {
  customMenuMessages = messages;
  if (customEditorRegistered) return;
  customEditorRegistered = true;

  Boot.registerMenu({
    key: 'fiHeaderSelect',
    factory: () => new HeaderSelectMenu(),
  });
  Boot.registerMenu({
    key: 'fiLinkCard',
    factory: () => new LinkCardToolbarButton(),
  });
  Boot.registerMenu({
    key: 'fiTableInput',
    factory: () => new TableToolbarButton(),
  });
  Boot.registerRenderElem({
    type: 'fi-link-card',
    renderElem: (elemNode) => renderLinkCardElement(elemNode as LinkCardElement),
  });
  Boot.registerElemToHtml({
    type: 'fi-link-card',
    elemToHtml: (elemNode) => elemToLinkCardHtml(elemNode as LinkCardElement),
  });
  Boot.registerParseElemHtml({
    selector: 'a.fi-link-card[data-fi-link-card]',
    parseElemHtml: (elem) => parseLinkCardHtml(elem as never),
  });
  Boot.registerPlugin((editor) => {
    const { isVoid } = editor;
    editor.isVoid = (elem) => DomEditor.getNodeType(elem) === 'fi-link-card' || isVoid(elem);
    return editor;
  });
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
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkImageUrl, setLinkImageUrl] = useState('');
  const [tableRows, setTableRows] = useState('3');
  const [tableColumns, setTableColumns] = useState('3');
  const lastEmittedHtmlRef = useRef(value);
  const savedSelectionRef = useRef<SavedSelection | null>(null);
  const editorLanguage = getWangEditorLanguage(locale);

  useMemo(() => {
    i18nChangeLanguage(editorLanguage);
  }, [editorLanguage]);

  useMemo(() => registerCustomEditor(messages), [messages]);

  const closePanel = useCallback(() => {
    setPanelAction(null);
  }, []);

  const openPanel = useCallback((action: ComposeAction, instance: IDomEditor) => {
    savedSelectionRef.current = cloneSelection(instance.selection);
    setPanelAction(action);
    instance.hidePanelOrModal();
  }, []);

  const insertNodeAtSelection = useCallback(
    (node: unknown) => {
      if (!editor) return;
      restoreEditorSelection(editor, savedSelectionRef.current);
      editor.focus?.();
      if (DomEditor.isSelectedEmptyParagraph(editor as unknown as IDomEditor)) {
        SlateTransforms.removeNodes(editor as unknown as IDomEditor, { mode: 'highest' });
      }
      SlateTransforms.insertNodes(editor as unknown as IDomEditor, node as never, { mode: 'highest' });
      SlateTransforms.insertNodes(
        editor as unknown as IDomEditor,
        { type: 'paragraph', children: [{ text: '' }] } as never,
        { mode: 'highest' }
      );
      editor.updateView?.();
    },
    [editor]
  );

  function submitPanel() {
    if (!editor) return;

    if (panelAction === 'linkCard') {
      const url = safeComposeUrl(linkUrl);
      if (!url || !linkTitle.trim()) return;
      const linkCard = {
        url,
        title: linkTitle.trim(),
        description: linkDescription.trim() || undefined,
        imageUrl: normalizeImageUrl(linkImageUrl) || undefined,
      };

      insertNodeAtSelection(toLinkCardNode(linkCard));
      onEditorMetaChange?.({ linkCard });
      setLinkUrl('');
      setLinkTitle('');
      setLinkDescription('');
      setLinkImageUrl('');
      closePanel();
      return;
    }

    if (panelAction === 'table') {
      const rows = Math.min(Math.max(Number.parseInt(tableRows, 10) || 0, 1), 12);
      const columns = Math.min(Math.max(Number.parseInt(tableColumns, 10) || 0, 1), 8);
      if (!rows || !columns) return;
      insertNodeAtSelection(toTableNode(rows, columns));
      setTableRows(String(rows));
      setTableColumns(String(columns));
      closePanel();
    }
  }

  const toolbarConfig = useMemo(
    () => ({
      toolbarKeys: [
        'fiHeaderSelect',
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
        'fiTableInput',
        'codeBlock',
        'divider',
        '|',
        'fiLinkCard',
        '|',
        'undo',
        'redo',
        'fullScreen',
      ],
      excludeKeys: ['uploadImage', 'uploadVideo', 'insertVideo'],
      modalAppendToBody: true,
    }),
    []
  );

  const editorConfig = useMemo(
    () => ({
      placeholder,
      readOnly: !!disabled,
      scroll: true,
      hoverbarKeys: {
        text: {
          menuKeys: ['bold', 'italic', 'code', 'color', 'bgColor', 'insertLink', 'clearStyle'],
        },
        link: { menuKeys: ['editLink', 'unLink', 'viewLink'] },
        image: { menuKeys: ['editImage', 'deleteImage'] },
      },
      MENU_CONF: {
        insertImage: {
          checkImage(src: string) {
            return !!normalizeImageUrl(src) || messages.imageUrl;
          },
          parseImageSrc(src: string) {
            return normalizeImageUrl(src);
          },
        },
        editImage: {
          checkImage(src: string) {
            return !!normalizeImageUrl(src) || messages.imageUrl;
          },
          parseImageSrc(src: string) {
            return normalizeImageUrl(src);
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
      },
    }),
    [disabled, messages.imageUrl, messages.linkUrl, placeholder]
  );

  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedHtmlRef.current && value !== editor.getHtml()) {
      editor.setHtml(value);
      lastEmittedHtmlRef.current = value;
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
          actionListeners.set(instance as unknown as IDomEditor, (action) => openPanel(action, instance));
          onReady?.({
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
              {panelAction === 'linkCard' ? messages.linkCard : messages.table}
            </div>

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
