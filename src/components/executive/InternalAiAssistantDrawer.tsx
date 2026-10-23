/**
 * MÓDULO B.4 (MODO INTERNO): ASISTENTE INTELIGENTE OPERATIVO 24/7 ZERO-PII
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 1 (< 400 líneas) y Guardrail Forense 2 (Zero-PII)
 */

import React, { useState } from 'react';
import {
  Bot,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  Database,
} from 'lucide-react';
import { INTERNAL_AI_QUICK_PROMPTS } from '../../data/cruseExecutiveData';
import {
  InternalAiAggregatedContext,
  InternalAiQueryResponse,
} from '../../types/executive';

interface InternalAiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}

interface InternalChatTurn {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  model?: string;
  ts: string;
}

export const InternalAiAssistantDrawer: React.FC<InternalAiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  token,
}) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<InternalAiAggregatedContext | null>(null);
  const [messages, setMessages] = useState<InternalChatTurn[]>([
    {
      id: 'welcome_internal_ai',
      sender: 'assistant',
      text: 'Bienvenido al Asistente Inteligente Operativo Interno 24/7 de Microfinanciera Cruse. Estoy conectado en tiempo real a las métricas agregadas de Azure PostgreSQL 16 bajo protocolo estricto Zero-PII. Puedes consultarme sobre colocación del mes, alertas PLD/FT pendientes, semáforo de morosidad por Hub (Chihuahua, León, Cancún) o estado de líneas de fondeo.',
      model: 'Zero-PII Executive Engine',
      ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  if (!isOpen) return null;

  const sendQuery = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || loading) return;

    const userMsg: InternalChatTurn = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: trimmed,
      ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await fetch('/api/executive/internal-ai-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await res.json()) as InternalAiQueryResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Error al consultar el Asistente Operativo Interno');
      }
      setSnapshot(data.aggregatedSnapshot);
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          sender: 'assistant',
          text: data.answer,
          model: data.model,
          ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text:
            err instanceof Error
              ? `⚠️ ${err.message}`
              : '⚠️ No fue posible completar la consulta en este momento.',
          ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#249E82] to-[#396CAE] flex items-center justify-center text-white shadow-lg">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-white">
                  Asistente Operativo Interno 24/7 (Dirección & Cumplimiento)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Zero-PII
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Consultas en lenguaje natural sobre PostgreSQL 16 sin exponer nombres, CURP ni RFC al modelo IA.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Cerrar asistente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Snapshot Agregado Certificado */}
        {snapshot && (
          <div className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-teal-400 font-bold flex items-center gap-1">
              <Database className="w-3.5 h-3.5" /> Snapshot Agregado PostgreSQL:
            </span>
            <span className="text-slate-300">
              Créditos Activos: <strong>{snapshot.totalActiveLoans}</strong>
            </span>
            <span className="text-slate-300">
              Alertas PLD Pendientes: <strong className="text-amber-300">{snapshot.pldAlertsPendingCount}</strong>
            </span>
            <span className="text-slate-300">
              Semáforo: 🟢{snapshot.semaphoreDistribution.VERDE} / 🟡{snapshot.semaphoreDistribution.AMARILLO} / 🔴{snapshot.semaphoreDistribution.ROJO}
            </span>
          </div>
        )}

        {/* Preguntas Rápidas para Oficial de Cumplimiento y Gerencia */}
        <div className="p-4 bg-slate-900/40 border-b border-slate-800 space-y-2">
          <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Consultas Ejecutivas Frecuentes (1 Clic):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {INTERNAL_AI_QUICK_PROMPTS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => sendQuery(item.question)}
                disabled={loading}
                className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs text-slate-200 transition-all"
              >
                <div className="font-bold text-[#00D1FF]">{item.title}</div>
                <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{item.question}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Historial de Conversación */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl p-4 text-xs leading-relaxed whitespace-pre-line ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white font-medium'
                    : 'bg-slate-900 border border-slate-800 text-slate-200'
                }`}
              >
                {m.text}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 px-1">
                {m.ts} {m.model ? `· ${m.model}` : ''}
              </span>
            </div>
          ))}
          {loading && (
            <div className="text-xs text-teal-400 animate-pulse">
              Consultando agregaciones en PostgreSQL 16 y generando respuesta Zero-PII...
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuery(question);
          }}
          className="p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ej: ¿Cuántos créditos se otorgaron este mes? ¿Hay alertas pendientes de PLD?"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00D1FF]"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#249E82] hover:bg-[#1e856e] disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Consultar</span>
          </button>
        </form>
      </div>
    </div>
  );
};
