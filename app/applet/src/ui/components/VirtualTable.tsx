import React, { useState, useRef } from 'react';

interface VirtualTableProps {
  data: any[];
  columns: string[];
  headers: string[];
  height?: number;
  rowHeight?: number;
}

export const VirtualTable: React.FC<VirtualTableProps> = ({
  data,
  columns,
  headers,
  height = 400,
  rowHeight = 35
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalHeight = data.length * rowHeight;
  const visibleCount = Math.ceil(height / rowHeight) + 5;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const endIndex = Math.min(data.length, startIndex + visibleCount);
  const visibleData = data.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
      <div style={{
        display: 'flex',
        background: '#f8fafc',
        borderBottom: '2px solid #e2e8f0',
        fontWeight: 600,
        fontSize: '12px',
        color: '#64748b',
        textTransform: 'uppercase',
        position: 'sticky',
        top: 0,
        zIndex: 2
      }}>
        {headers.map((header, i) => (
          <div key={i} style={{
            flex: 1,
            padding: '10px 12px',
            borderRight: i < headers.length - 1 ? '1px solid #e2e8f0' : 'none'
          }}>
            {header}
          </div>
        ))}
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          height,
          overflowY: 'auto',
          position: 'relative'
        }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0
          }}>
            {visibleData.map((row, idx) => {
              const actualIndex = startIndex + idx;
              return (
                <div
                  key={actualIndex}
                  style={{
                    display: 'flex',
                    height: rowHeight,
                    borderBottom: '1px solid #f1f5f9',
                    alignItems: 'center',
                    fontSize: '13px',
                    background: actualIndex % 2 === 0 ? '#fff' : '#fafafa'
                  }}
                >
                  {columns.map((col, cIdx) => (
                    <div
                      key={col}
                      style={{
                        flex: 1,
                        padding: '0 12px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        borderRight: cIdx < columns.length - 1 ? '1px solid #f1f5f9' : 'none'
                      }}
                      title={row && row[col] !== undefined && row[col] !== null ? String(row[col]) : ''}
                    >
                      {row && row[col] !== undefined && row[col] !== null ? String(row[col]) : '—'}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        Всего строк: {data.length.toLocaleString()} (Виртуализированный скролл)
      </div>
    </div>
  );
};
