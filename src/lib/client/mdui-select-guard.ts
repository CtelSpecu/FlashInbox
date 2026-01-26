export interface MduiSelectViewportGuardOptions {
  zIndex?: number;
  margin?: number;
  preferTop?: boolean;
}

export function installMduiSelectViewportGuard(
  selectEl: Element | null,
  options: MduiSelectViewportGuardOptions = {}
): () => void {
  if (!selectEl) return () => {};

  const zIndex = options.zIndex ?? 4000;
  const margin = options.margin ?? 16;
  const preferTop = options.preferTop ?? (selectEl.closest('aside') !== null);

  const getMenu = () => {
    const root = (selectEl as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    return (root?.querySelector('mdui-menu') as HTMLElement | null) ?? null;
  };

  const applyMenuGuard = () => {
    const menu = getMenu();
    if (!menu) return;

    menu.style.zIndex = String(zIndex);
    menu.style.overflowY = 'auto';
    menu.style.overscrollBehavior = 'contain';

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const menuRect = menu.getBoundingClientRect();
    const available = Math.floor(viewportHeight - margin - menuRect.top);
    if (available > 0) {
      menu.style.maxHeight = `${available}px`;
    }
  };

  const preparePlacement = () => {
    const rect = (selectEl as HTMLElement).getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const nextPlacement =
      preferTop || (spaceBelow < 240 && spaceAbove > spaceBelow) ? 'top' : 'bottom';
    (selectEl as HTMLElement).setAttribute('placement', nextPlacement);
  };

  const onOpen = () => {
    preparePlacement();
    requestAnimationFrame(() => applyMenuGuard());
    window.addEventListener('resize', applyMenuGuard, { passive: true });
    window.visualViewport?.addEventListener('resize', applyMenuGuard, { passive: true });
  };

  const onOpened = () => applyMenuGuard();

  const onClose = () => {
    window.removeEventListener('resize', applyMenuGuard);
    window.visualViewport?.removeEventListener('resize', applyMenuGuard);
  };

  const onPointerDown = () => preparePlacement();

  selectEl.addEventListener('open', onOpen as EventListener);
  selectEl.addEventListener('opened', onOpened as EventListener);
  selectEl.addEventListener('close', onClose as EventListener);
  selectEl.addEventListener('closed', onClose as EventListener);
  selectEl.addEventListener('pointerdown', onPointerDown as EventListener, { passive: true });

  return () => {
    selectEl.removeEventListener('open', onOpen as EventListener);
    selectEl.removeEventListener('opened', onOpened as EventListener);
    selectEl.removeEventListener('close', onClose as EventListener);
    selectEl.removeEventListener('closed', onClose as EventListener);
    selectEl.removeEventListener('pointerdown', onPointerDown as EventListener);
    window.removeEventListener('resize', applyMenuGuard);
    window.visualViewport?.removeEventListener('resize', applyMenuGuard);
  };
}
