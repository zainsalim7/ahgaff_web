FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Set environment variables
ENV PORT=8080
ENV DB_NAME=ahgaff_attendance
ENV SECRET_KEY=ahgaff-university-secure-key-2026-x9f8k2m5n7p3q1w4

# Expose port
EXPOSE 8080

# Run the application - use shell form to expand $PORT
CMD uvicorn server:app --host 0.0.0.0 --port $PORT
