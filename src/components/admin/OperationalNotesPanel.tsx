/**
 * BLOCK DE NOTAS OPERATIVAS SIEMPRE VISIBLE (RN-02 y RN-04)
 *
 * @implements RN-02 (Notas operativas fijadas visibles en expedientes y créditos)
 * @implements RN-04 (Notas operativas fijadas visibles en inversionistas)
 * @implements Regla 3 Anti-God-Object (< 210 líneas) y Regla 6 SQA (0 any)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Pin, PlusCircle, MessageSquareText } from 'lucide-react';

export type NoteEntityType = 'LOAN_ACCOUNT' | 'INVESTOR' | 'INVESTMENT' | 'EXPEDIENTE';

interface OperationalNoteItem {
  id: string;
  entity_type: NoteEntityType;
  entity_id: string;
  note_content: string;
  is_pinned: 0 | 1;
  author_email: string;
  created_at: string;
}

interface OperationalNotesPanelProps {
  entityType: NoteEntityType;
  entityId: string;
  title?: string;
}

export const OperationalNotesPanel: React.FC<OperationalNotesPanelProps> = ({
  entityType,
  entityId,
  title = 'Block de Notas Operativas Fijadas (RN-02 / RN-04)',
}) => {
  const [notes, setNotes] = useState<OperationalNoteItem[]>([]);
  const [newContent, setNewContent] = useState('');
  const [isPinned, setIsPinned] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') ?? '' : '';

  const fetchNotes = useCallback(async () => {
    if (!entityId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notes/${entityType}/${encodeURIComponent(entityId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.notes)) {
        setNotes(data.notes);
      }
    } catch (err: unknown) {
      console.error('Error cargando notas operativas:', err);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, token]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newContent.trim().length < 3 || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entityType,
          entityId,
          noteContent: newContent.trim(),
          isPinned,
        }),
      });
      const data = await res.json();
      if (data.ok && data.note) {
        setNotes((prev) => [data.note, ...prev]);
        setNewContent('');
      }
    } catch (err: unknown) {
      console.error('Error guardando nota operativa:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-slate-900/90 border border-amber-500/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">{title}</h3>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-semibold">
          {notes.length} nota(s)
        </span>
      </div>

      <form onSubmit={handleAddNote} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Registrar acuerdo, teléfono alterno o indicación operativa..."
          className="flex-1 bg-black/50 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500"
        />
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 px-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            className="rounded border-white/20"
          />
          <Pin className="w-3 h-3 text-amber-400" />
          <span>Fijar</span>
        </label>
        <button
          type="submit"
          disabled={newContent.trim().length < 3 || saving}
          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1 disabled:opacity-40"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>{saving ? 'Guardando...' : 'Agregar Nota'}</span>
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-slate-400">Cargando bitácora de notas...</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          Sin notas operativas registradas para este registro.
        </p>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          {notes.map((n) => (
            <div
              key={n.id}
              className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                n.is_pinned === 1
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                  : 'bg-black/40 border-white/10 text-slate-300'
              }`}
            >
              <div className="space-y-0.5">
                <p className="font-medium">{n.note_content}</p>
                <p className="text-[10px] text-slate-400">
                  Por {n.author_email} • {new Date(n.created_at).toLocaleString('es-MX')}
                </p>
              </div>
              {n.is_pinned === 1 && (
                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                  <Pin className="w-2.5 h-2.5" /> Fijada
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
