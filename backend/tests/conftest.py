import os
import sys
import shutil
import pytest
from dotenv import load_dotenv

# Add parent directory and backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Load environmental variables from the root of the project
root_env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../..", ".env"))
load_dotenv(root_env_path, override=True)

# Set the chroma DB path to a test directory to avoid corrupting production data
TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_chromadb_data"))
os.environ["CHROMA_DB_PATH"] = TEST_DB_PATH

# Clean up any existing test database at load time, before any models/clients are imported
if os.path.exists(TEST_DB_PATH):
    try:
        shutil.rmtree(TEST_DB_PATH)
    except Exception as e:
        print(f"Could not clean test DB path {TEST_DB_PATH} on load: {e}")

@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    yield
    
    # Try cleaning up test database after the session yields (ignores active lock errors)
    if os.path.exists(TEST_DB_PATH):
        try:
            shutil.rmtree(TEST_DB_PATH)
        except Exception as e:
            pass
