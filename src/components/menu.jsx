import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  LayoutTemplate,
  Users,
  FileText,
  Network,
  LetterText,
  PenLine,
  MoreHorizontal,
  MoreVertical,
  DatabaseBackup,
  Server,
  Bell,
} from 'lucide-react';

const NAV_ITEMS = [
  {
    id: 'create',
    label: 'চিঠি',
    icon: PenLine,
    path: '/letter',
  },
  {
    id: 'report',
    label: 'প্রতিবেদন',
    icon: FileText,
    path: '/report',
  },
  { type: 'separator', id: 'sep-1' },
  {
    id: 'database',
    label: 'চিঠিসমূহ',
    icon: Database,
    path: '/database/letter',
  },
  {
    id: 'report-database',
    label: 'প্রতিবেদনসমূহ',
    icon: Server,
    path: '/database/report',
  },
  { type: 'separator', id: 'sep-2' },
  {
    id: 'amela',
    label: 'আমেলা',
    icon: Users,
    path: '/amela',
  },
  {
    id: 'jamaat',
    label: 'জামাতসমূহ',
    icon: Network,
    path: '/jamaat',
  },
  { type: 'separator', id: 'sep-3' },
  {
    id: 'template',
    label: 'খসড়া',
    icon: LayoutTemplate,
    path: '/template',
  },
  {
    id: 'cosmetics',
    label: 'পত্রসজ্জা',
    icon: LetterText,
    path: '/cosmetics',
  },
  {
    id: 'notification',
    label: 'স্মরণিকা',
    icon: Bell,
    path: '/notification-editor',
  }
];

// Helper to chunk nav items into sections separated by type: 'separator'
const SECTIONS = NAV_ITEMS.reduce((acc, item) => {
  if (item.type === 'separator') {
    acc.push({ separator: item, items: [] });
  } else {
    if (acc.length === 0) {
      acc.push({ separator: null, items: [] });
    }
    acc[acc.length - 1].items.push(item);
  }
  return acc;
}, []);

export default function Menu() {
  const navigate = useNavigate();

  const [hoveredId, setHoveredId] = useState(null);
  // -1: fully collapsed, 0: first section, 1: up to second section, etc.
  const [expandedSectionIndex, setExpandedSectionIndex] = useState(SECTIONS.length - 1);

  const [clickedId, setClickedId] = useState(() => {
    return localStorage.getItem("lastClickedId") || null;
  });

  const timerRef = useRef(null);
  const isLongPressRef = useRef(false);

  const handleTouchMouseDown = () => {
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (expandedSectionIndex === -1) {
        setExpandedSectionIndex(SECTIONS.length - 1);
      } else {
        setExpandedSectionIndex(-1);
      }
    }, 500);
  };

  const handleTouchMouseUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = () => {
    if (isLongPressRef.current) return;

    setExpandedSectionIndex((prev) => {
      if (prev >= SECTIONS.length - 1) {
        return -1;
      }
      return prev + 1;
    });
  };

  const isFullyCollapsed = expandedSectionIndex === -1;

  return (
    <div className="flex flex-col items-center menu">
      {!isFullyCollapsed &&
        SECTIONS.slice(0, expandedSectionIndex + 1).map((section, sIdx) => (
          <div key={sIdx} className="flex flex-col items-center w-full">
            {section.separator && (
              <div className="flex justify-center items-center my-2 w-full">
                <div className="bg-white w-full h-px" />
              </div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isHovered = hoveredId === item.id;
              const isClicked = clickedId === item.id;

              return (
                <button
                  key={item.id}
                  className={`btn ${isClicked ? 'clicked' : ''}`}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    setClickedId(item.id);
                    localStorage.setItem("lastClickedId", item.id);
                    navigate(item.path);
                  }}
                >
                  {isHovered ? (
                    <div
                      className={`box bg-transparent flex flex-row items-center gap-2 pl-6 pr-px ${isClicked ? 'box-clicked-and-hovered' : ''
                        }`}
                    >
                      <span
                        className={`px-4 pt-1.5 pb-1 rounded-full transition-colors text-lg font-bengali font-medium ${isClicked ? 'bg-white text-black' : 'bg-black text-white'
                          } ${isClicked ? 'border-2 border-black' : 'border-2 border-transparent'
                          }`}
                      >
                        {item.label}
                      </span>

                      <div
                        className={`btn rounded-full flex items-center justify-center transition-colors ${isClicked ? 'bg-white text-black' : 'bg-black text-white'
                          }`}
                      >
                        <Icon />
                      </div>
                    </div>
                  ) : (
                    <Icon />
                  )}
                </button>
              );
            })}
          </div>
        ))}

      <button
        className="mt-auto btn toggle-btn"
        onMouseDown={handleTouchMouseDown}
        onMouseUp={handleTouchMouseUp}
        onMouseLeave={handleTouchMouseUp}
        onTouchStart={handleTouchMouseDown}
        onTouchEnd={handleTouchMouseUp}
        onClick={handleClick}
        aria-label={isFullyCollapsed ? 'Expand menu' : 'Cycle menu layout'}
      >
        {isFullyCollapsed ? <MoreVertical /> : <MoreHorizontal />}
      </button>
    </div>
  );
}