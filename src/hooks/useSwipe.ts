import { useEffect, useRef } from 'react';

interface SwipeOptions {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    threshold?: number;
}

export const useSwipe = ({ onSwipeLeft, onSwipeRight, threshold = 60 }: SwipeOptions) => {
    const touchStart = useRef<number | null>(null);
    const touchEnd = useRef<number | null>(null);

    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            touchStart.current = e.targetTouches[0].clientX;
            touchEnd.current = e.targetTouches[0].clientX;
        };

        const handleTouchMove = (e: TouchEvent) => {
            touchEnd.current = e.targetTouches[0].clientX;
        };

        const handleTouchEnd = () => {
            if (!touchStart.current || !touchEnd.current) return;
            const distance = touchStart.current - touchEnd.current;
            const isLeftSwipe = distance > threshold;
            const isRightSwipe = distance < -threshold;

            if (isLeftSwipe && onSwipeLeft) onSwipeLeft();
            if (isRightSwipe && onSwipeRight) onSwipeRight();

            touchStart.current = null;
            touchEnd.current = null;
        };

        document.addEventListener('touchstart', handleTouchStart);
        document.addEventListener('touchmove', handleTouchMove);
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [onSwipeLeft, onSwipeRight, threshold]);
};
