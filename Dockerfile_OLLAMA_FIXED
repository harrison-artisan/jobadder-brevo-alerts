FROM node:22-slim

# Install Ollama (requires zstd for extraction)
RUN apt-get update && apt-get install -y curl zstd && \
    curl -fsSL https://ollama.com/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create improved startup script with Ollama health check
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "🚀 Starting Ollama service..."\n\
ollama serve &\n\
OLLAMA_PID=$!\n\
\n\
echo "⏳ Waiting for Ollama to be ready..."\n\
# Wait up to 30 seconds for Ollama to be ready\n\
for i in {1..30}; do\n\
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then\n\
    echo "✅ Ollama is ready!"\n\
    break\n\
  fi\n\
  if [ $i -eq 30 ]; then\n\
    echo "⚠️  Ollama failed to start, continuing anyway..."\n\
  fi\n\
  sleep 1\n\
done\n\
\n\
echo "🚀 Starting Node.js application..."\n\
node index.js &\n\
NODE_PID=$!\n\
\n\
# Wait for either process to exit\n\
wait -n $OLLAMA_PID $NODE_PID\n\
\n\
# If one exits, kill the other\n\
kill $OLLAMA_PID $NODE_PID 2>/dev/null\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose port
EXPOSE 3000

# Start both Ollama and the app
CMD ["/app/start.sh"]
