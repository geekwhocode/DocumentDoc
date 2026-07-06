import { UploadCloud, FileText, Loader2, X } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  documents: string[];
  uploading: boolean;
  onFileUpload: (files: FileList | null) => Promise<void>;
}

export default function Sidebar({ isOpen, onClose, documents, uploading, onFileUpload }: SidebarProps) {
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileUpload(e.target.files);
  };

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
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-surface-700 transition-colors"
            title="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Knowledge Base</h3>
          
          <label className={`
            relative flex flex-col items-center justify-center p-6 border-2 border-dashed 
            rounded-xl cursor-pointer transition-colors
            ${uploading ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-400'}
          `}>
            <input 
              type="file" 
              className="hidden" 
              accept=".pdf,.doc,.docx,.md,.txt" 
              onChange={handleFileUpload}
              disabled={uploading}
              multiple
            />
            {uploading ? (
              <Loader2 className="h-8 w-8 text-brand-500 animate-spin mb-2" />
            ) : (
              <UploadCloud className="h-8 w-8 text-slate-400 mb-2" />
            )}
            <span className="text-sm text-center text-slate-500 dark:text-slate-400">
              {uploading ? 'Processing...' : 'Upload PDF or Word'}
            </span>
          </label>

          <div className="mt-6 space-y-2">
            {documents.map((doc, idx) => (
               <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-surface-900 border border-slate-100 dark:border-slate-700">
                <FileText className="h-4 w-4 text-brand-500" />
                <span className="text-sm truncate">{doc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
