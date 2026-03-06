#!/bin/bash

# Deployment script for production

set -e

echo "🚀 Deploying Scrum Poker to production..."

# Pull latest code (if using git)
# git pull origin main

# Build and deploy with docker-compose
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

echo "✅ Deployment complete!"

# Show running containers
docker-compose -f docker-compose.prod.yml ps

# Show logs
echo "📋 Recent logs:"
docker-compose -f docker-compose.prod.yml logs --tail=50
