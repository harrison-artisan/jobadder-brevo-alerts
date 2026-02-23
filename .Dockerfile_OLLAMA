FROM node:22-slim

# Install Ollama
RUN apt-get update && apt-get install -y curl && \
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

# Create startup script
RUN echo '#!/bin/bash\n\
# Start Ollama in background\n\
ollama serve &\n\
OLLAMA_PID=$!\n\
\n\
# Wait for Ollama to be ready\n\
sleep 5\n\
\n\
# Start the Node.js application\n\
node index.js &\n\
NODE_PID=$!\n\
\n\
# Wait for either process to exit\n\
wait -n $OLLAMA_PID $NODE_PID\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose port
EXPOSE 3000

# Start both Ollama and the app
CMD ["/app/start.sh"]
