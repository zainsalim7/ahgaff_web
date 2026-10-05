FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    chromium \
    fonts-noto-core fonts-noto-color-emoji fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
# Chromium headless مطلوب لتوليد PDF المراسلات الرسمية (routes/correspondence_pdf.py)
ENV CHROMIUM_PATH=/usr/bin/chromium

# Copy backend requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Set environment variables (non-sensitive defaults)
ENV PORT=8080
ENV DB_NAME=ahgaff_attendance
# NOTE: SECRET_KEY must be set via Railway → Service → Variables (NOT in Dockerfile)

# Expose port
EXPOSE 8080

# Run the application (JSON form via sh -c to expand $PORT)
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port $PORT"]
