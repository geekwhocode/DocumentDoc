import { FileText, X, Plus, MessageSquare, Trash2 } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  documents: string[];
  activeFiles: string[];
  onToggleActiveFile: (filename: string) => void;
  conversations: { id: string; title: string }[];
  currentConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onDeleteConversation: (id: string) => void;
  onNewChat: () => void;
}

export default function Sidebar({ 
  isOpen, 
  onClose, 
  documents, 
  activeFiles,
  onToggleActiveFile,
  conversations,
  currentConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-15 md:hidden" 
          onClick={onClose}
        />
      )}
      <div className={`
        fixed inset-y-0 left-0 z-20 w-64 bg-surface-100 dark:bg-surface-800 border-r border-slate-200 dark:border-slate-700 
        flex flex-col h-full transition-transform duration-300 md:relative md:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'}
      `}>
        <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center">
              <span className="text-white font-bold text-xl">✨</span>
            </div>
            <h2 className="font-semibold text-lg">DocumentDoc</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-surface-700 transition-colors md:hidden"
            title="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          {/* New Chat Button */}
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full py-2.5 px-4 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>

          {/* Knowledge Base Section */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Knowledge Base</h3>
            

            <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
              {documents.map((doc, idx) => {
                const isActive = activeFiles.includes(doc);
                return (
                  <div 
                    key={idx} 
                    onClick={() => onToggleActiveFile(doc)}
                    className={`
                      flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border text-xs
                      ${isActive 
                        ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/20 dark:border-brand-800 dark:text-brand-400' 
                        : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-50 dark:bg-surface-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-surface-800'}
                    `}
                    title={isActive ? "Click to disable for this chat" : "Click to enable for this chat"}
                  >
                    <FileText className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-brand-500' : 'text-slate-400 dark:text-slate-500'}`} />
                    <span className="truncate flex-1">{doc}</span>
                    {isActive && <span className="text-[10px] bg-brand-500 text-white rounded-full px-1.5 py-0.2">Active</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Chats Section */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Recent Chats</h3>
            <div className="space-y-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic px-2">No recent chats</p>
              ) : (
                conversations.map(conv => (
                  <div 
                    key={conv.id}
                    className={`
                      group flex items-center justify-between rounded-lg p-2 text-sm font-medium cursor-pointer transition-colors
                      ${currentConversationId === conv.id 
                        ? 'bg-slate-200 dark:bg-surface-700 text-slate-900 dark:text-slate-100' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-900'}
                    `}
                    onClick={() => {
                      onSelectConversation(conv.id);
                      onClose();
                    }}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <MessageSquare className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="truncate">{conv.title}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-300 dark:hover:bg-surface-800 text-slate-400 hover:text-red-500 transition-all"
                      title="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
