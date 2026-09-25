/**
 * Theo dõi số lớp form con / modal đang mở phía trên Slide Panel.
 * Khi còn ít nhất 1 lớp, Slide Panel KHÔNG được đóng bởi backdrop hoặc phím Esc
 * (quy chuẩn Child Form & Modal Guard).
 */
let openLayers = 0;

function syncBody() {
  if (typeof document === 'undefined') return;
  if (openLayers > 0) {
    document.body.dataset.modalOpen = String(openLayers);
    document.body.classList.add('modal-open');
  } else {
    delete document.body.dataset.modalOpen;
    document.body.classList.remove('modal-open');
  }
}

export function pushModalLayer(): () => void {
  openLayers += 1;
  syncBody();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openLayers = Math.max(0, openLayers - 1);
    syncBody();
  };
}

export function isModalLayerOpen(): boolean {
  return openLayers > 0;
}
