'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Boot, DomEditor, i18nChangeLanguage, type IButtonMenu, type IDomEditor } from '@wangeditor/editor';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import { h } from 'snabbdom';

import { buildLinkCardHtml, safeComposeUrl } from '@/lib/client/compose';
import type { Locale } from '@/lib/i18n';

type EditorApi = {
  getHtml: () => string;
  setHtml: (value: string) => void;
  destroy?: () => void;
  dangerouslyInsertHtml: (html: string) => void;
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
    getHtml: () => string;
    setHtml: (value: string) => void;
  }) => void;
  onEditorMetaChange?: (meta: {
    linkCard?: { url: string; title: string; description?: string; imageUrl?: string };
  }) => void;
}

type ComposeAction = 'linkCard';
type LinkCardElement = {
  type: 'fi-link-card';
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
  children: [{ text: '' }];
};

const actionListeners = new WeakMap<IDomEditor, (action: ComposeAction) => void>();
let customEditorRegistered = false;
let customMenuMessages: WangEditorClientProps['messages'] | null = null;

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
    key: 'fiLinkCard',
    factory: () => new LinkCardToolbarButton(),
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
  const lastEmittedHtmlRef = useRef(value);
  const editorLanguage = getWangEditorLanguage(locale);

  useMemo(() => {
    i18nChangeLanguage(editorLanguage);
  }, [editorLanguage]);

  useMemo(() => registerCustomEditor(messages), [messages]);

  const closePanel = useCallback(() => {
    setPanelAction(null);
  }, []);

  function submitPanel() {
    if (!editor || panelAction !== 'linkCard') return;

    const url = safeComposeUrl(linkUrl);
    if (!url || !linkTitle.trim()) return;
    const linkCard = {
      url,
      title: linkTitle.trim(),
      description: linkDescription.trim() || undefined,
      imageUrl: normalizeImageUrl(linkImageUrl) || undefined,
    };

    editor.restoreSelection?.();
    editor.focus?.();
    editor.insertNode(toLinkCardNode(linkCard));
    editor.insertNode({ type: 'paragraph', children: [{ text: '' }] });
    editor.updateView?.();
    onEditorMetaChange?.({ linkCard });
    setLinkUrl('');
    setLinkTitle('');
    setLinkDescription('');
    setLinkImageUrl('');
    closePanel();
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
        'insertTable',
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
      maxLength: 3000,
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
          onInsertedImage(imageNode: { url?: string; href?: string } | null) {
            if (!imageNode) return;
            imageNode.url = '';
            imageNode.href = '';
          },
        },
        editImage: {
          checkImage(src: string) {
            return !!normalizeImageUrl(src) || messages.imageUrl;
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
      },
    }),
    [disabled, messages.imageUrl, messages.linkUrl, placeholder]
  );

  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedHtmlRef.current && value !== editor.getHtml()) {
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
        defaultHtml={value}
        onCreated={(instance) => {
          setEditor(instance as EditorApi);
          actionListeners.set(instance as unknown as IDomEditor, (action) => setPanelAction(action));
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
            <div className="mb-3 text-sm font-semibold">{messages.linkCard}</div>

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
