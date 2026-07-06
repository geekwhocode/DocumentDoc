# Gemini Clone RAG Application

A full-stack web application that replicates the Google Gemini chat interface, acting as a Retrieval-Augmented Generation (RAG) system based on user-uploaded documents.

## Tech Stack
* **Frontend:** React (Vite), Tailwind CSS, Lucide React
* **Backend:** Python with FastAPI
* **Vector Database:** ChromaDB
* **Embeddings:** HuggingFace (`sentence-transformers/all-MiniLM-L6-v2`)
* **LLM Integration:** LiteLLM (Supports Llama 3 and Gemini API)
* **Authentication:** Supabase (Email/Password & Google OAuth)

---

## Prerequisites

Before running the application, make sure you configure your environment variables. 

### Backend Environment Variables (`backend/.env` or root `.env`)
You need the following API keys for the language models to function:
```env
GOOGLE_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
HF_TOKEN=your_huggingface_token (Optional, for downloading embeddings)
```

### Frontend Environment Variables (`frontend/.env`)
Configure your Supabase credentials to enable the Authentication UI:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## How to Run

You can run this project using Docker (Recommended) or by running the services manually.

### Option 1: Running with Docker (Recommended)

Make sure you have Docker and Docker Compose installed on your system.

1. Open a terminal in the root directory of the project.
2. Build and start the containers:
   ```bash
   docker compose up --build
   ```
3. The frontend will be accessible at `http://localhost:5173`.
4. The backend API will be accessible at `http://localhost:8000`.

### Option 2: Running Manually (Without Docker)

If you don't have Docker installed, you can start the frontend and backend manually. You will need to open two separate terminal windows.

#### 1. Start the Backend (Terminal 1)
Make sure you have `python3` installed.
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Start the Frontend (Terminal 2)
Make sure you have Node.js and `npm` installed.
```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:5173` in your browser to view the application!

---

## Features
- **Authentication**: Secure login via Supabase.
- **RAG Pipeline**: Upload PDFs or Word Documents. The backend chunks, embeds (using local HuggingFace models), and stores the data in ChromaDB.
- **Dynamic Model Switching**: Switch seamlessly between Llama 3 (via Groq) and Gemini Pro for inference.
- **Sleek UI**: Premium Light/Dark mode toggle with a Gemini-inspired layout.
