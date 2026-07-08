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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Chat history states
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
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
      formData.append('model', 'groq/llama-3.3-70b-versatile');

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
    // Prevent sending empty queries or submitting while another query is in progress
    if (!text.trim() || chatLoading) return;

    // 1. Immediately append the user's message to the chat history UI
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setChatLoading(true);
    
    // 2. Pre-allocate an empty assistant chat message bubble in the UI.
    // We will progressively stream the LLM response text into this empty bubble.
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      // Exclude system messages (errors) from history to avoid polluting LLM context window
      const history = messages.filter(m => m.role !== 'system');
      
      // We use the browser's native fetch API rather than Axios because Axios does not support
      // reading streaming response bodies chunk-by-chunk natively in web browsers.
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: text,
          history,
          model,
          conversation_id: currentConversationId,
          active_files: activeFiles
        })
      });

      // Handle non-2xx HTTP responses (e.g., 429 Rate Limits, 500 Server Errors)
      if (!response.ok) {
        let errMsg = `HTTP error! status: ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.detail) errMsg = errData.detail;
        } catch (_) {}
        throw new Error(errMsg);
      }

      // Establish a reader to read the response body as a stream of binary data chunks (Uint8Arrays)
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported on response.');
      }

      const decoder = new TextDecoder(); // Decodes the stream bytes back to UTF-8 text strings
      let buffer = '';                   // Temporary buffer to hold partial Server-Sent Events (SSE) lines
      let streamConvId: string | null = null;
      let accumulatedContent = '';       // Stores the full response text as it builds up

      // Main read loop: processes binary chunks until the stream is completely consumed
      while (true) {
        const { value, done } = await reader.read();
        if (done) break; // Stream is finished

        // Decode the chunk value (Uint8Array) and append it to our buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Split the buffer by newlines to extract individual SSE lines
        const lines = buffer.split('\n');
        
        // The last element of lines might be an incomplete SSE line (e.g. data: {"content": "he... no closing braces).
        // We pop it off and store it back in our buffer to be completed by the next chunk.
        buffer = lines.pop() || '';

        // Process completed lines
        for (const line of lines) {
          const trimmed = line.trim();
          // SSE events in our API are prefixed with "data: "
          if (!trimmed.startsWith('data: ')) continue;
          
          const rawData = trimmed.slice(6); // Extract the JSON payload after the "data: " prefix
          try {
            const dataObj = JSON.parse(rawData);
            
            // Check the SSE event structure type
            if (dataObj.type === 'conversation_id') {
              // Store conversation id returned for a new chat
              streamConvId = dataObj.conversation_id;
            } else if (dataObj.type === 'content') {
              // Append newly generated LLM token/chunk to the total accumulated text
              const newContent = dataObj.content;
              accumulatedContent += newContent;
              
              // Dynamically update React state to re-render the assistant message bubble in the UI
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                // Double check that the last message is indeed the pre-allocated assistant message
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                  updated[lastIdx] = { ...updated[lastIdx], content: accumulatedContent };
                }
                return updated;
              });
            } else if (dataObj.type === 'error') {
              // Handle runtime exceptions from backend LLM calls (e.g., API key failures, rate limits)
              throw new Error(dataObj.error);
            }
          } catch (err) {
            console.error('Error parsing SSE chunk:', err);
          }
        }
      }

      // Final sweep: process any trailing data remaining in the buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          const rawData = trimmed.slice(6);
          try {
            const dataObj = JSON.parse(rawData);
            if (dataObj.type === 'content') {
              accumulatedContent += dataObj.content;
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                  updated[lastIdx] = { ...updated[lastIdx], content: accumulatedContent };
                }
                return updated;
              });
            }
          } catch (e) {}
        }
      }

      // If this was a new chat conversation, update the global state with the conversation id
      // and refresh the sidebar conversation list to display the new chat title
      if (!currentConversationId && streamConvId) {
        setCurrentConversationId(streamConvId);
        fetchConversations();
      }

    } catch (error: any) {
      console.error('Chat failed:', error);
      const errMsg = error.message || 'Failed to get response. Please wait a few seconds and try again.';
      setMessages(prev => {
        const updated = [...prev];
        // If the request failed before the LLM could stream anything, remove the empty assistant bubble
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && !updated[updated.length - 1].content) {
          updated.pop();
        }
        // Append a system notification bubble with the error message in the chat
        return [...updated, { role: 'system', content: errMsg }];
      });
    } finally {
      setChatLoading(false); // Enable input submission again
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

  const handleDeleteDocument = async (filename: string) => {
    try {
      await axios.delete(`http://localhost:8000/documents/${encodeURIComponent(filename)}`);
      setActiveFiles(prev => prev.filter(f => f !== filename));
      fetchGlobalDocuments();
    } catch (e) {
      console.error("Failed to delete document:", e);
      alert("Failed to delete document from database.");
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
        onDeleteDocument={handleDeleteDocument}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={setCurrentConversationId}
        onDeleteConversation={handleDeleteConversation}
        onNewChat={handleNewChat}
      />
      <div className="flex-1 flex flex-col relative">
        <header className="absolute top-0 right-0 p-4 z-10 flex gap-3 items-center">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-surface-700 transition-colors"
            title="Toggle Theme"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="px-4 py-2 text-xs font-semibold rounded-full border border-slate-200 dark:border-surface-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-700 hover:text-slate-900 dark:hover:text-white transition-all"
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
