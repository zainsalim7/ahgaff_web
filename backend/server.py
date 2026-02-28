import sys
import os

# Add backend subdirectory to Python path so imports work correctly
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
sys.path.insert(0, backend_dir)

# Change working directory so relative paths work
os.chdir(backend_dir)

# Now import the actual server module
import importlib
server_module = importlib.import_module('server')
app = server_module.app
