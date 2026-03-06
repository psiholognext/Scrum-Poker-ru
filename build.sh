#!/bin/bash

# Build script for Scrum Poker Docker container

set -e

echo "🚀 Building Scrum Poker Docker container..."

# Build the Docker image
docker build -t scrum-poker:latest .

echo "✅ Docker image built successfully!"

# Optional: Tag for different environments
docker tag scrum-poker:latest scrum-poker:production

echo "🏷️  Tagged image for production"

# Show image info
docker images | grep scrum-poker

echo "📦 Build complete! Use 'docker run -p 3000:3000 -p 3001:3001 scrum-poker:latest' to run"
