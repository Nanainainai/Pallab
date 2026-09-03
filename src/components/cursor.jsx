import { useEffect, useState } from 'react';

export default function Cursor() {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [cursorState, setCursorState] = useState('default');
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e) => {
            setPosition({ x: e.clientX, y: e.clientY });
            setIsVisible(true);
        };

        const handleMouseOver = (e) => {
            const target = e.target;

            // Check for text entry elements
            const isTextEntry = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

            const expandBtn = target.closest('[data-cursor="menu-expand"]');
            const collapseBtn = target.closest('[data-cursor="menu-collapse"]');
            const interactiveBtn = target.closest('a, li, ul, select, button, [role="button"], .interactive, .btn');

            if (isTextEntry) {
                setCursorState('text');
            } else if (expandBtn) {
                setCursorState('menu-expand');
            } else if (collapseBtn) {
                setCursorState('menu-collapse');
            } else if (interactiveBtn) {
                setCursorState('pointer');
            } else {
                setCursorState('default');
            }
        };

        const handleMouseLeave = () => setIsVisible(false);
        const handleMouseEnter = () => setIsVisible(true);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseover', handleMouseOver);
        document.addEventListener('mouseleave', handleMouseLeave);
        document.addEventListener('mouseenter', handleMouseEnter);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseover', handleMouseOver);
            document.removeEventListener('mouseleave', handleMouseLeave);
            document.removeEventListener('mouseenter', handleMouseEnter);
        };
    }, []);

    const renderCursor = () => {
        const style = {
            position: 'fixed',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 999999,
            transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
            opacity: isVisible ? 1 : 0,
            mixBlendMode: 'difference'
        };

        // Shared classes/inline logic for centering
        const isCentered = cursorState !== 'default';
        const centeringTransform = isCentered ? 'translate(-50%, -50%)' : '';

        return (
            <div style={{ ...style, transform: `${style.transform} ${centeringTransform}` }}>
                {cursorState === 'menu-expand' && (
                    <svg viewBox="0 0 24 24" width="32" height="32">
                        <circle cx="12" cy="5" r="2" fill="white" />
                        <circle cx="12" cy="12" r="2" fill="white" />
                        <circle cx="12" cy="19" r="2" fill="white" />
                    </svg>
                )}
                {cursorState === 'menu-collapse' && (
                    <svg viewBox="0 0 24 24" width="32" height="32">
                        <circle cx="5" cy="12" r="2" fill="white" />
                        <circle cx="12" cy="12" r="2" fill="white" />
                        <circle cx="19" cy="12" r="2" fill="white" />
                    </svg>
                )}
                {cursorState === 'pointer' && (
                    <svg viewBox="0 0 24 24" width="32" height="32">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2" strokeDasharray="3 3" />
                    </svg>
                )}
                {cursorState === 'default' && (
                    <svg viewBox="0 0 8 8" width="32" height="32">
                        <polygon fill="white" points="1.61 3.32 .52 4.91 .28 .38 3.51 3.55 1.61 3.32" />
                    </svg>
                )}
                {cursorState === 'text' && (
                    <svg viewBox="0 0 24 24" width="32" height="32">
                        <line x1="12" y1="6" x2="12" y2="18" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        <line x1="9" y1="6" x2="15" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        <line x1="9" y1="18" x2="15" y2="18" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>   
                )}
            </div>
        );
    };

    return renderCursor();
}