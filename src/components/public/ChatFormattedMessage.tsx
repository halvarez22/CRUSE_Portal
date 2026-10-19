import React from 'react';

interface ChatFormattedMessageProps {
  text: string;
  isUser?: boolean;
}

/**
 * Renderizador seguro de Markdown ligero a nodos React nativos (CRUSE-APO-2026-016).
 * - Regla 5 SSD (Zero-XSS): Prohibido usar dangerouslySetInnerHTML.
 * - Preserva filas de tablas Markdown (| col | col |) que contengan <br> internos en sus celdas.
 * - Soporta encabezados (###), listas (1., -), separadores (---), citas (>), tablas y negritas (**texto**).
 */
export const ChatFormattedMessage: React.FC<ChatFormattedMessageProps> = ({ text, isUser = false }) => {
  const renderInline = (content: string, keyPrefix: string): React.ReactNode[] => {
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong
            key={`${keyPrefix}-b-${idx}`}
            className={isUser ? 'font-extrabold text-white' : 'font-bold text-[#041734] dark:text-white'}
          >
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={`${keyPrefix}-t-${idx}`}>{part}</React.Fragment>;
    });
  };

  // Renderiza celdas de tabla respetando saltos <br> internos como bloques seguros
  const renderCellContent = (cellText: string, keyPrefix: string): React.ReactNode => {
    const segments = (cellText || '—').split(/<br\s*\/?>/gi).map((s) => s.trim()).filter(Boolean);
    if (segments.length <= 1) {
      return renderInline(segments[0] || '—', keyPrefix);
    }
    return (
      <div className="space-y-1">
        {segments.map((seg, sIdx) => (
          <div key={`${keyPrefix}-seg-${sIdx}`} className="leading-snug">
            {renderInline(seg, `${keyPrefix}-s-${sIdx}`)}
          </div>
        ))}
      </div>
    );
  };

  // Paso 1: Dividir por \n y expandir <br> únicamente en líneas que NO sean filas de tabla
  const rawLines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      lines.push(trimmed);
    } else {
      for (const sub of rawLine.split(/<br\s*\/?>/gi)) {
        lines.push(sub);
      }
    }
  }

  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!.trim();

    if (!line) {
      i++;
      continue;
    }

    // 1. Separador horizontal (---)
    if (/^-{3,}$/.test(line)) {
      blocks.push(<hr key={`hr-${i}`} className="my-3 border-slate-200 dark:border-white/10" />);
      i++;
      continue;
    }

    // 2. Bloque de cita / Nota (> ...)
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s*/, '');
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-4 border-[#249E82] pl-3 py-1 my-2 text-xs sm:text-sm italic text-slate-600 dark:text-slate-300 bg-[#249E82]/5 rounded-r-lg"
        >
          {renderInline(quoteText, `bq-${i}`)}
        </blockquote>
      );
      i++;
      continue;
    }

    // 3. Bloque de Tabla Markdown (| col1 | col2 |)
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|') && lines[i]!.trim().endsWith('|')) {
        tableLines.push(lines[i]!.trim());
        i++;
      }

      const validRows = tableLines
        .filter((row) => !/^\|[\s\-:|]+\|$/.test(row))
        .map((row) => row.slice(1, -1).split('|').map((cell) => cell.trim()))
        .filter((cells) => cells.length > 0);

      if (validRows.length > 0) {
        const headerCells = validRows[0]!;
        const bodyRows = validRows.slice(1);
        blocks.push(
          <div key={`tbl-${i}`} className="my-2.5 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-white/10">
                  {headerCells.map((cell, cIdx) => (
                    <th key={`th-${cIdx}`} className="py-2 px-3 font-bold text-[#041734] dark:text-[#00D1FF]">
                      {renderCellContent(cell || 'N/A', `th-${i}-${cIdx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              {bodyRows.length > 0 && (
                <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                  {bodyRows.map((rowCells, rIdx) => (
                    <tr key={`tr-${rIdx}`} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                      {headerCells.map((_, cIdx) => (
                        <td key={`td-${rIdx}-${cIdx}`} className="py-2 px-3 align-top">
                          {renderCellContent(rowCells[cIdx] || '—', `td-${i}-${rIdx}-${cIdx}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
      }
      continue;
    }

    // 4. Encabezados (### o ##)
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      blocks.push(
        <h4
          key={`h-${i}`}
          className={`font-bold text-xs sm:text-sm mt-2.5 mb-1 ${
            isUser ? 'text-white' : 'text-[#041734] dark:text-[#4CD360]'
          }`}
        >
          {renderInline(headingMatch[2]!, `h-${i}`)}
        </h4>
      );
      i++;
      continue;
    }

    // 5. Listas Ordenadas (1. , 2. )
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1.5 my-2 pl-1">
          {items.map((item, idx) => (
            <li key={`oli-${idx}`} className="leading-relaxed">
              {renderInline(item, `ol-${i}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 6. Listas de Viñetas (- , * , • )
    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-2 pl-1">
          {items.map((item, idx) => (
            <li key={`uli-${idx}`} className="leading-relaxed">
              {renderInline(item, `ul-${i}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 7. Párrafo estándar
    blocks.push(
      <p key={`p-${i}`} className="mb-2 last:mb-0 leading-relaxed">
        {renderInline(line, `p-${i}`)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1 break-words">{blocks}</div>;
};
