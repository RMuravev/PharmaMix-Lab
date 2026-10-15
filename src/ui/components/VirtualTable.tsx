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
  rowHeight = 40
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalHeight = data.length * rowHeight;
  const visibleCount = Math.ceil(height / rowHeight) + 2;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 1);
  const endIndex = Math.min(data.length, startIndex + visibleCount);

  const visibleData = data.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{ height, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', position: 'relative' }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
      </table>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', position: 'absolute', top: offsetY, left: 0 }}>
          <tbody>
            {visibleData.map((row, rIdx) => {
              const actualIndex = startIndex + rIdx;
              return (
                <tr key={actualIndex} style={{ height: rowHeight, borderBottom: '1px solid #f1f5f9' }}>
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} style={{ padding: '6px 12px', fontSize: '12px', color: '#1e293b' }}>
                      {row[col] !== undefined ? String(row[col]) : ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
