import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Plus, Menu, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

interface ChatInterfaceProps {
  onToggleSidebar: () => void;
  documents: string[];
  uploading: boolean;
  onFileUpload: (files: FileList | null) => Promise<void>;
}

export default function ChatInterface({ onToggleSidebar, documents, uploading, onFileUpload }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('gemini/gemini-2.5-flash');
  const [models, setModels] = useState<{id: string, name: string}[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch available models
    axios.get('http://localhost:8000/models').then(res => {
      setModels(res.data.models);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // API call to backend
      const history = messages.filter(m => m.role !== 'system');
      const response = await axios.post('http://localhost:8000/chat', {
        question: userMessage,
        history,
        model
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response.data.answer }]);
    } catch (error) {
      console.error('Chat failed:', error);
      setMessages(prev => [...prev, { role: 'system', content: 'Failed to get response.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileUpload(e.target.files);
    setShowMenu(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-50 dark:bg-surface-900 relative">
      
      {/* Header bar containing Toggle Menu */}
      <header className="absolute top-0 left-0 p-4 z-10">
        <button 
          onClick={onToggleSidebar}
          className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-surface-800 text-slate-600 dark:text-slate-300 transition-colors"
          title="Toggle Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Main chat window */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pt-20">
        {messages.length === 0 ? (
          <div className="flex flex-col justify-center h-full max-w-2xl mx-auto space-y-6 px-4">
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-purple-400 dark:to-pink-400">
              Meet DocumentDoc.
            </h1>
            <p className="text-2xl md:text-3xl text-slate-400 dark:text-slate-500 font-normal leading-relaxed">
              Upload PDF or Word files, switch models on the fly, and chat with your documents using advanced RAG.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-brand-500'}`}>
                {msg.role === 'user' ? <User className="h-5 w-5 text-slate-600 dark:text-slate-300" /> : <Bot className="h-5 w-5 text-white" />}
              </div>
              <div className="flex-1 prose dark:prose-invert max-w-none">
                <div className={`inline-block rounded-2xl p-4 ${msg.role === 'user' ? 'bg-brand-500 text-white' : 'bg-white dark:bg-surface-800 shadow-sm border border-slate-100 dark:border-slate-700'}`}>
                  {msg.role === 'user' ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
                </div>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-4 max-w-4xl mx-auto">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="bg-white dark:bg-surface-800 shadow-sm border border-slate-100 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input container at the bottom */}
      <div className="p-4 md:p-6 bg-surface-50 dark:bg-surface-900 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto">
          
          {/* Active upload chips display */}
          {(documents.length > 0 || uploading) && (
            <div className="flex flex-wrap gap-2 mb-3">
              {documents.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-surface-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                  <FileText className="h-3.5 w-3.5 text-brand-500" />
                  <span className="truncate max-w-[120px]">{doc}</span>
                </div>
              ))}
              {uploading && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 text-xs text-brand-600 dark:text-brand-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Uploading...</span>
                </div>
              )}
            </div>
          )}

          {/* Unified chat input pill */}
          <form onSubmit={handleSubmit} className="relative flex items-center bg-white dark:bg-surface-800 border border-slate-200 dark:border-slate-700 rounded-[28px] px-4 py-2.5 shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-brand-500 transition-all">
            
            {/* Left + button and dropdown menu */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-surface-700 text-slate-500 dark:text-slate-400 transition-colors flex items-center justify-center"
                title="Add content"
              >
                <Plus className={`h-5 w-5 transition-transform duration-200 ${showMenu ? 'rotate-45' : ''}`} />
              </button>

              {/* Upload Dropdown popover */}
              {showMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-surface-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 py-1 z-30">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-surface-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                  >
                    <span>📁</span> Upload files
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.md,.txt"
                    multiple
                  />
                </div>
              )}
            </div>

            {/* Input textarea */}
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Ask DocumentDoc..."
              className="flex-1 max-h-32 min-h-[24px] bg-transparent resize-none focus:outline-none py-1.5 px-3 text-sm text-slate-800 dark:text-white"
              rows={1}
            />

            {/* Right side controls: Model Select & Send Button */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-500 dark:text-slate-400 focus:outline-none appearance-none cursor-pointer px-3 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-surface-700 transition-colors pr-6"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id} className="dark:bg-surface-800 dark:text-slate-100">{m.name.includes("Groq") ? "Llama 3.3" : "Gemini 2.5"}</option>
                  ))}
                </select>
                {/* Visual dropdown chevron */}
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">
                  ▼
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="p-2 bg-brand-500 hover:bg-brand-600 text-white rounded-full transition-colors disabled:opacity-50 flex items-center justify-center"
                title="Send query"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
