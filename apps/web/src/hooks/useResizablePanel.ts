import { useState, useEffect, useCallback } from 'react';

interface UseResizablePanelProps {
    panelId: string;
    storageKey: string | null;
    defaultWidth: string;
    minWidth?: number;
    maxWidthOffset?: number;
    isMobile?: boolean;
    maxWidth?: number;
}

export function useResizablePanel({
    panelId,
    storageKey,
    defaultWidth,
    minWidth = 400,
    maxWidthOffset = 80,
    isMobile = false,
    maxWidth,
}: UseResizablePanelProps) {
    const [resizedWidth, setResizedWidth] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Khôi phục kích thước đã lưu từ localStorage khi mount
    useEffect(() => {
        if (storageKey && !isMobile) {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const widthNum = parseInt(saved, 10);
                if (!isNaN(widthNum)) {
                    // Clamp saved width with maxWidth if provided
                    const resolvedMax = maxWidth !== undefined ? maxWidth : (window.innerWidth - maxWidthOffset);
                    setResizedWidth(Math.max(minWidth, Math.min(widthNum, resolvedMax)));
                }
            }
        }
    }, [storageKey, isMobile, maxWidth, maxWidthOffset, minWidth]);

    // Clamp resizedWidth if maxWidth shrinks dynamically
    useEffect(() => {
        if (maxWidth !== undefined && resizedWidth !== null && resizedWidth > maxWidth) {
            setResizedWidth(Math.max(minWidth, maxWidth));
        }
    }, [maxWidth, resizedWidth, minWidth]);

    // Xử lý kéo co giãn (Drag-to-Resize)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (isMobile) return;
        e.preventDefault();
        setIsDragging(true);

        const startX = e.clientX;
        const panelElement = document.getElementById(panelId);
        
        // Lấy width thực tế hiện tại
        const resolvedMax = maxWidth !== undefined ? maxWidth : (window.innerWidth - maxWidthOffset);
        let startWidth = resizedWidth || resolvedMax;
        if (panelElement) {
            const rect = panelElement.getBoundingClientRect();
            if (rect.width > 0) {
                startWidth = rect.width;
            }
        }

        const handleMouseMove = (moveEvent: MouseEvent) => {
            // Chuột dịch sang trái (clientX giảm) -> panel rộng ra (deltaX tăng)
            const deltaX = startX - moveEvent.clientX;
            const newWidth = startWidth + deltaX;

            const resolvedMaxInner = maxWidth !== undefined ? maxWidth : (window.innerWidth - maxWidthOffset);
            const clampedWidth = Math.max(minWidth, Math.min(newWidth, resolvedMaxInner));

            setResizedWidth(clampedWidth);
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            setIsDragging(false);

            const deltaX = startX - upEvent.clientX;
            const finalWidth = startWidth + deltaX;
            const resolvedMaxInner = maxWidth !== undefined ? maxWidth : (window.innerWidth - maxWidthOffset);
            const clampedWidth = Math.max(minWidth, Math.min(finalWidth, resolvedMaxInner));

            if (storageKey) {
                localStorage.setItem(storageKey, clampedWidth.toString());
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [panelId, resizedWidth, minWidth, maxWidthOffset, storageKey, isMobile, maxWidth]);

    // Trả về width CSS cuối cùng
    const width = isMobile 
        ? '100%' 
        : (resizedWidth !== null ? `${resizedWidth}px` : defaultWidth);

    return {
        width,
        isDragging,
        handleMouseDown,
        resizedWidth,
    };
}
