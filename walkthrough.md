# Gemini Clone RAG Application Walkthrough

The Gemini Clone RAG application has been successfully built and scaffolded. The codebase has been adapted from your existing Python files into a production-ready, full-stack architecture with a React frontend and a FastAPI backend, orchestrated by Docker.

## What was built

### Backend (`/backend`)
- **FastAPI application (`main.py`)**: Built out robust endpoints for document ingestion (`/upload`), model fetching (`/models`), and chat interface (`/chat`).
- **Ingestion logic (`ingest.py`)**: Adapted your advanced chunking logic. Integrated `pymupdf4llm` and `python-docx` for reliable parsing. Using `sentence-transformers/all-MiniLM-L6-v2` via HuggingFace for lightning-fast local embeddings.
- **Answer logic (`answer.py`)**: Fully integrated your query rewriting, unranked retrieval, merging, and LLM-based reranking. The backend dynamically uses Llama 3 or Gemini based on the frontend selection via LiteLLM.

### Frontend (`/frontend`)
- **Vite React App**: Scaffolding with the latest React templates.
- **Tailwind CSS + Dark Mode**: Carefully curated a sleek, minimalist design mirroring Gemini, with a fully functional Dark/Light theme toggle built directly into the Tailwind configuration.
- **Authentication**: A premium login UI (`Auth.tsx`) powered by Supabase, supporting both Magic Link/Email and Google OAuth options.
- **Interactive Chat UI**: Replicated the core Gemini UI structure using Lucide React for crisp iconography. The chat interface fully supports multi-line markdown rendering.

### DevOps (`docker-compose.yml`)
- Complete Dockerization of the platform.
- The `chromadb_data` volume is persistently mounted to ensure your embedded knowledgebase survives container restarts.

## How to Verify and Run

To bring up the environment and test the platform:

1. **Environment Variables**: Add your Supabase credentials into the `frontend/.env` file. You also need to confirm that `GOOGLE_API_KEY` and `GROQ_API_KEY` are present in your backend `.env` file for LiteLLM.
2. **Start Docker**:
   Run the following command from the root of your project:
   ```bash
   docker-compose up --build
   ```
3. **Verify Functionality**:
   - Navigate to `http://localhost:5173` in your browser.
   - You should see the sleek new login page. Sign up for an account to enter the workspace.
   - Once logged in, try uploading a PDF or Word Document via the Sidebar drag-and-drop zone.
   - Ask questions about the uploaded document and experiment with toggling between the Gemini and Llama 3 models!
