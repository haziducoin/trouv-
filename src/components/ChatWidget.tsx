import { useState, useRef, useEffect } from 'react'
import { X, MessageCircle } from 'lucide-react'
import { PromptInputBox } from '@/components/ui/ai-prompt-box'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const WHATSAPP_NUMBER = '33600000000' // ← remplace par ton numéro WhatsApp Business

type Role = 'user' | 'assistant'
interface Message { role: Role; content: string; escalate?: boolean }

const QUICK_REPLIES = [
  { label: '💰 Tarifs', text: 'Quels sont les tarifs ?' },
  { label: '🔐 Accès', text: 'Comment créer un compte ?' },
  { label: '📊 Données', text: 'Quelles données sont disponibles ?' },
  { label: '👤 Agent', text: 'Je veux parler à un humain' },
]

export default function ChatWidget() {
  const [open, setOpen]           = useState(false)
  const [loading, setLoading]     = useState(false)
  const [showNotif, setShowNotif] = useState(true)
  const [history, setHistory]     = useState<{ role: Role; content: string }[]>([])
  const [messages, setMessages]   = useState<Message[]>([
    { role: 'assistant', content: 'Bonjour 👋 Je suis l\'assistant trouvé!\n\nJe peux vous aider sur les offres, l\'accès, le fonctionnement ou toute autre question. Comment puis-je vous aider ?' },
  ])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const escalateWhatsApp = (context: string) => {
    const msg = encodeURIComponent(`Bonjour, je suis sur trouvé! et j'ai besoin d'aide. Contexte : ${context}`)
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank')
  }

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    setShowNotif(false)

    const userMsg = { role: 'user' as Role, content: text }
    setMessages(prev => [...prev, userMsg])
    const newHistory = [...history, userMsg]
    setHistory(newHistory)
    setLoading(true)

    try {
      const res  = await fetch(`${API_URL}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: newHistory }),
      })
      const data = await res.json()

      const botMsg: Message = {
        role:     'assistant',
        content:  data.reply ?? 'Je rencontre un problème. Notre équipe reste disponible :',
        escalate: data.escalate ?? !res.ok,
      }
      setMessages(prev => [...prev, botMsg])
      if (!botMsg.escalate) {
        setHistory(prev => [...prev, { role: 'assistant', content: botMsg.content }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Je rencontre un problème de connexion. Notre équipe reste disponible :',
        escalate: true,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => { setOpen(o => !o); setShowNotif(false) }}
        className="fixed bottom-7 right-7 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#124bd2] text-white shadow-[0_8px_30px_rgba(18,75,210,0.45)] transition-all hover:scale-110 hover:bg-[#0b3fbc]"
        aria-label="Support"
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
        {showNotif && !open && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[10px] font-bold">1</span>
        )}
      </button>

      {/* PANEL */}
      <div className={`fixed bottom-24 right-7 z-50 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)] transition-all duration-300 ${open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'}`}
        style={{ maxHeight: '560px' }}>

        {/* Header */}
        <div className="flex items-center gap-3 bg-[#124bd2] px-4 py-3.5 text-white">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
            <MessageCircle size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">Support trouvé!</p>
            <p className="flex items-center gap-1.5 text-[11px] text-white/75">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
              IA disponible · agent humain si besoin
            </p>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-white/60 transition hover:text-white">
            <X size={17} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4" style={{ maxHeight: '380px' }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''} max-w-[88%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${msg.role === 'assistant' ? 'bg-[#124bd2]' : 'bg-slate-300'}`}>
                {msg.role === 'assistant'
                  ? <MessageCircle size={13} className="text-white" />
                  : <span className="text-[10px] font-bold text-white">Moi</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'rounded-br-sm bg-[#124bd2] text-white'
                    : 'rounded-bl-sm border border-slate-100 bg-white text-slate-800 shadow-sm'
                }`}
                  dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
                />
                {/* Quick replies on first bot message */}
                {msg.role === 'assistant' && i === 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {QUICK_REPLIES.map(qr => (
                      <button key={qr.text} onClick={() => send(qr.text)}
                        className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#124bd2] transition hover:bg-[#124bd2] hover:text-white">
                        {qr.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* WhatsApp escalation */}
                {msg.escalate && (
                  <button onClick={() => escalateWhatsApp(messages.find(m => m.role === 'user')?.content ?? '')}
                    className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[#25d366] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#128c7e]">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.528 5.858L.057 23.786a.75.75 0 0 0 .92.92l5.928-1.471A11.935 11.935 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
                    Parler à un agent sur WhatsApp
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-2 self-start">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#124bd2]">
                <MessageCircle size={13} className="text-white" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-slate-100 bg-white px-4 py-3 shadow-sm">
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input — prompt box IA */}
        <div className="border-t border-slate-100 bg-white p-3">
          <PromptInputBox
            onSend={(message) => send(message)}
            isLoading={loading}
            placeholder="Posez votre question..."
          />
          <p className="mt-2 text-center text-[10px] text-slate-400">Propulsé par Claude (Anthropic) · trouvé! Support</p>
        </div>
      </div>
    </>
  )
}
