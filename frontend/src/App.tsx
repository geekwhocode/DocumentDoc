import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import Auth from './components/Auth';
import { supabase } from './lib/supabase';
import axios from 'axios';

function App() {
  const [session, setSession] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(true);
  
  // Knowledge Base global files list
  const [globalDocuments, setGlobalDocuments] = useState<string[]>([]);
  // Attached files for the current conversation session
  const [activeFiles, setActiveFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Chat history states
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Fetch recent conversations list
  const fetchConversations = async () => {
    try {
      const res = await axios.get('http://localhost:8000/conversations');
      setConversations(res.data.conversations);
    } catch (e) {
      console.error("Failed to fetch conversations:", e);
    }
  };

  // Fetch all documents uploaded globally
  const fetchGlobalDocuments = async () => {
    try {
      const res = await axios.get('http://localhost:8000/documents');
      setGlobalDocuments(res.data.documents || []);
    } catch (e) {
      console.error("Failed to fetch global documents:", e);
    }
  };

  useEffect(() => {
    if (session) {
      fetchConversations();
      fetchGlobalDocuments();
    }
  }, [session]);

  // Fetch messages when currentConversationId changes
  useEffect(() => {
    if (currentConversationId) {
      axios.get(`http://localhost:8000/conversations/${currentConversationId}`)
        .then(res => {
          setMessages(res.data.messages || []);
        })
        .catch(err => {
          console.error("Failed to fetch messages:", err);
          setMessages([]);
        });
    } else {
      setMessages([]);
    }
    // Reset active files list when loading a different session
    setActiveFiles([]);
  }, [currentConversationId]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadPromises = Array.from(files).map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', 'gemini/gemini-2.5-flash');

      try {
        await axios.post('http://localhost:8000/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        
        // Add to Knowledge Base list if it's new
        setGlobalDocuments(prev => {
          if (prev.includes(file.name)) return prev;
          return [...prev, file.name];
        });
        
        // Auto-attach this file to the active conversation files
        setActiveFiles(prev => {
          if (prev.includes(file.name)) return prev;
          return [...prev, file.name];
        });

      } catch (error) {
        console.error(`Upload failed for ${file.name}:`, error);
        alert(`Failed to upload ${file.name}`);
      }
    });

    await Promise.all(uploadPromises);
    setUploading(false);
  };

  const handleSendMessage = async (text: string, model: string) => {
    if (!text.trim() || chatLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setChatLoading(true);

    try {
      const history = messages.filter(m => m.role !== 'system');
      const response = await axios.post('http://localhost:8000/chat', {
        question: text,
        history,
        model,
        conversation_id: currentConversationId,
        active_files: activeFiles // Filter backend RAG search by active files!
      });

      const { answer, conversation_id } = response.data;
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      
      if (!currentConversationId) {
        setCurrentConversationId(conversation_id);
        fetchConversations();
      }
    } catch (error: any) {
      console.error('Chat failed:', error);
      const errMsg = error.response?.data?.detail || 'Failed to get response. Please wait a few seconds and try again.';
      setMessages(prev => [...prev, { role: 'system', content: errMsg }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await axios.delete(`http://localhost:8000/conversations/${id}`);
      if (currentConversationId === id) {
        setCurrentConversationId(null);
      }
      fetchConversations();
    } catch (e) {
      console.error("Failed to delete conversation:", e);
    }
  };

  const handleNewChat = () => {
    setCurrentConversationId(null);
    setActiveFiles([]);
  };

  const handleToggleActiveFile = (filename: string) => {
    setActiveFiles(prev => {
      if (prev.includes(filename)) {
        return prev.filter(f => f !== filename);
      } else {
        return [...prev, filename];
      }
    });
  };

  const handleRemoveActiveFile = (filename: string) => {
    setActiveFiles(prev => prev.filter(f => f !== filename));
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50 dark:bg-surface-900 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        documents={globalDocuments}
        activeFiles={activeFiles}
        onToggleActiveFile={handleToggleActiveFile}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={setCurrentConversationId}
        onDeleteConversation={handleDeleteConversation}
        onNewChat={handleNewChat}
      />
      <div className="flex-1 flex flex-col relative">
        <header className="absolute top-0 right-0 p-4 z-10 flex gap-4 items-center">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title="Toggle Theme"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            Sign out
          </button>
        </header>
        <ChatInterface 
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          documents={activeFiles}
          uploading={uploading}
          onFileUpload={handleFileUpload}
          messages={messages}
          loading={chatLoading}
          onSendMessage={handleSendMessage}
          onRemoveActiveFile={handleRemoveActiveFile}
        />
      </div>
    </div>
  );
}

export default App;
