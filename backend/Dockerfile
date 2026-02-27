FROM python:3.11-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Cloud Run injects PORT; default to 8080
ENV PORT=8080

EXPOSE 8080

CMD ["python", "main.py"]
