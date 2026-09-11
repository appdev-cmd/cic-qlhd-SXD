import { useState, useEffect, useRef, useCallback } from 'react';
import { isAbortError } from '../utils/errorUtils';

interface UseInfiniteScrollOptions<T> {
    /** Function to fetch a page of data. Returns items and whether more pages exist. */
    fetchFn: (page: number) => Promise<{ data: T[]; hasMore: boolean; totalCount?: number }>;
    /** Number of items per page (batch size) */
    pageSize?: number;
    /** Dependencies that trigger a reset (e.g. search, filters) */
    resetDeps?: any[];
    /** Initial loading state */
    initialLoading?: boolean;
}

interface UseInfiniteScrollReturn<T> {
    /** Accumulated items from all loaded pages */
    items: T[];
    /** Whether the initial load is in progress */
    isLoading: boolean;
    /** Whether loading more items (subsequent pages) */
    isLoadingMore: boolean;
    /** Whether there are more items to load */
    hasMore: boolean;
    /** Total count from the server (if available) */
    totalCount: number;
    /** Ref to attach to the sentinel element at the bottom of the list */
    sentinelRef: React.RefObject<HTMLDivElement | null>;
    /** Manually reset the list (called automatically when resetDeps change) */
    reset: () => void;
    /** Silent refresh: re-fetch all loaded pages in background without changing scroll/filter/loading */
    silentRefresh: () => void;
    /** Update items in-place (e.g. after local edit/delete) */
    setItems: React.Dispatch<React.SetStateAction<T[]>>;
}

export function useInfiniteScroll<T>({
    fetchFn,
    pageSize = 20,
    resetDeps = [],
    initialLoading = true,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollReturn<T> {
    const [items, setItems] = useState<T[]>([]);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(initialLoading);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const isFetchingRef = useRef(false);
    const isSilentRefreshingRef = useRef(false);
    // Request ID counter to prevent stale request responses from overwriting newer filter results
    const requestIdRef = useRef(0);

    // Fetch data for a specific page
    const fetchPage = useCallback(async (pageNum: number, isReset: boolean) => {
        // When resetting (filters changed), we must NEVER drop the fetch.
        // Increment requestId so any ongoing older request is discarded.
        const thisRequestId = ++requestIdRef.current;

        if (!isReset && isFetchingRef.current) {
            return;
        }
        isFetchingRef.current = true;

        if (isReset) {
            setIsLoading(true);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const result = await fetchFn(pageNum);

            // Stale check: if another request was initiated after this one, discard this result
            if (thisRequestId !== requestIdRef.current) {
                return;
            }

            if (isReset) {
                setItems(result.data);
            } else {
                // Deduplicate: prevent same item appearing in multiple pages
                setItems(prev => {
                    const existingIds = new Set(prev.map((item: any) => item.id));
                    const newItems = result.data.filter((item: any) => !existingIds.has(item.id));
                    return [...prev, ...newItems];
                });
            }

            setHasMore(result.hasMore);
            if (result.totalCount !== undefined) {
                setTotalCount(result.totalCount);
            }
        } catch (error) {
            if (thisRequestId !== requestIdRef.current) {
                return;
            }
            if (!isAbortError(error)) {
                console.error('useInfiniteScroll fetch error:', error);
            }
            if (isReset) {
                setItems([]);
                setTotalCount(0);
            }
        } finally {
            if (thisRequestId === requestIdRef.current) {
                setIsLoading(false);
                setIsLoadingMore(false);
                isFetchingRef.current = false;
            }
        }
    }, [fetchFn]);

    // Reset when dependencies change
    useEffect(() => {
        setPage(1);
        setHasMore(true);
        setItems([]);
        fetchPage(1, true);
    }, resetDeps); // eslint-disable-line react-hooks/exhaustive-deps

    // Load more when page increments (beyond page 1)
    useEffect(() => {
        if (page > 1) {
            fetchPage(page, false);
        }
    }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

    // IntersectionObserver for sentinel element
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && hasMore && !isFetchingRef.current) {
                    setPage(prev => prev + 1);
                }
            },
            {
                rootMargin: '100px', // Trigger early but safely before user reaches the bottom
                threshold: 0.1
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, isLoading, isLoadingMore, page]);

    const reset = useCallback(() => {
        setPage(1);
        setHasMore(true);
        setItems([]);
        fetchPage(1, true);
    }, [fetchPage]);

    /**
     * Silent refresh: re-fetch all currently loaded pages in background.
     * - NO loading spinner
     * - NO scroll reset
     * - NO filter reset
     * - Merges new data in-place (update existing, add new, remove deleted)
     */
    const silentRefresh = useCallback(async () => {
        if (isSilentRefreshingRef.current || isFetchingRef.current) return;
        isSilentRefreshingRef.current = true;

        try {
            const currentPage = page;
            const allItems: T[] = [];

            // Fetch all pages from 1 to currentPage
            for (let p = 1; p <= currentPage; p++) {
                const result = await fetchFn(p);
                allItems.push(...result.data);

                // Update hasMore and totalCount from the last fetched page
                if (p === currentPage) {
                    setHasMore(result.hasMore);
                    if (result.totalCount !== undefined) {
                        setTotalCount(result.totalCount);
                    }
                }
            }

            // Merge: replace the full item list (preserves order from server)
            // This handles updates, inserts, and deletes automatically
            setItems(allItems);
        } catch (error) {
            if (!isAbortError(error)) {
                console.error('useInfiniteScroll silentRefresh error:', error);
            }
        } finally {
            isSilentRefreshingRef.current = false;
        }
    }, [page, fetchFn]);

    return {
        items,
        isLoading,
        isLoadingMore,
        hasMore,
        totalCount,
        sentinelRef,
        reset,
        silentRefresh,
        setItems,
    };
}

export default useInfiniteScroll;
