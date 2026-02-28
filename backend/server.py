import sys
import os
import importlib.util

# Add backend subdirectory to Python path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
sys.path.insert(0, backend_dir)

# Load the actual server module from backend/ subdirectory directly
spec = importlib.util.spec_from_file_location("_actual_server", os.path.join(backend_dir, "server.py"))
_actual_server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_actual_server)

app = _actual_server.app
