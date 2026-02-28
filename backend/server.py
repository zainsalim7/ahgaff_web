import sys
import os

# Add backend subdirectory to Python path so imports work correctly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.server import app
