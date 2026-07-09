import os
import pytest
import tempfile
from ingest import run_ingestion
from answer import answer_question, collection
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import FaithfulnessMetric, AnswerRelevancyMetric
from tests.eval_llm import LiteLLMEvaluator

# Define the model to use for RAG pipeline & evaluation
MODEL_NAME = "groq/llama-3.3-70b-versatile"

@pytest.fixture(scope="module")
def populated_vector_db():
    """
    Ingests a sample text file into the sandboxed test ChromaDB.
    """
    # Ensure collection starts clean
    original_count = collection.count()
    
    content = """
    DocumentDoc is an open-source Full-Stack RAG application.
    It uses ChromaDB as its local vector database.
    The embeddings model is sentence-transformers/all-MiniLM-L6-v2, which runs locally.
    It allows dynamic selection of LLM models, including Gemini 2.5 Flash and Llama 3.3 via Groq.
    The parsing library pymupdf4llm is used to read PDFs.
    """
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="w", encoding="utf-8") as f:
        f.write(content)
        temp_path = f.name

    try:
        # Ingest the test file
        run_ingestion(temp_path, "documentdoc_overview.txt", model=MODEL_NAME)
        assert collection.count() > original_count
        yield
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

def test_query_rewriting():
    """
    Verifies that rewrite_query simplifies a query with conversational history.
    """
    from answer import rewrite_query
    history = [
        {"role": "user", "content": "What is DocumentDoc?"},
        {"role": "assistant", "content": "DocumentDoc is a Full-Stack RAG application."}
    ]
    query = "Does it support local vector databases?"
    rewritten = rewrite_query(query, history, model=MODEL_NAME)
    assert len(rewritten) > 0
    assert "vector" in rewritten.lower() or "database" in rewritten.lower()

def test_rag_pipeline_eval(populated_vector_db):
    """
    Runs the RAG pipeline and evaluates correctness using DeepEval (Faithfulness & Relevancy).
    """
    question = "Which embeddings model does DocumentDoc use and is it local?"
    
    # 1. Run the RAG pipeline
    answer, chunks = answer_question(question, history=[], model=MODEL_NAME)
    contexts = [chunk.page_content for chunk in chunks]
    
    print("\n--- RAG Output ---")
    print(f"Question: {question}")
    print(f"Answer: {answer}")
    print(f"Contexts Count: {len(contexts)}")
    print("------------------\n")

    # 2. Configure DeepEval test case
    test_case = LLMTestCase(
        input=question,
        actual_output=answer,
        retrieval_context=contexts,
        expected_output="DocumentDoc uses sentence-transformers/all-MiniLM-L6-v2 embeddings running locally."
    )

    # 3. Create Custom Evaluator instance
    evaluator = LiteLLMEvaluator(model_name=MODEL_NAME)

    # 4. Instantiate DeepEval Metrics with Llama 3.3 as Judge
    faithfulness_metric = FaithfulnessMetric(threshold=0.6, model=evaluator)
    relevancy_metric = AnswerRelevancyMetric(threshold=0.6, model=evaluator)

    # 5. Run test assertions
    assert_test(test_case, [faithfulness_metric, relevancy_metric])
