import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useEntityPanel, type EntityType } from './useEntityPanel';

/**
 * Mở Slide Panel chi tiết khi truy cập trực tiếp đường dẫn thực thể (VD: /projects/proj-001, /dossiers/DA-2026-DB-0182).
 */
export function useDeepLinkPanel(type: EntityType) {
  const { entityId } = useParams<{ entityId?: string }>();
  const { open } = useEntityPanel();
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!entityId || openedFor.current === entityId) return;
    openedFor.current = entityId;
    open(type, { id: decodeURIComponent(entityId) });
  }, [entityId, open, type]);
}
