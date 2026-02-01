#!/bin/bash
# 
# Example script showing how to use the seed-members tool
# 
# This demonstrates the correct usage pattern for the seed tool
# Run this from the backend directory
#

set -e

echo "================================================"
echo "  Seed Members Tool - Usage Examples"
echo "================================================"
echo ""

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from backend directory"
    exit 1
fi

echo "📋 Available options:"
echo ""
echo "1. Basic usage (100 members):"
echo "   ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com"
echo ""
echo "2. Custom count (50 members):"
echo "   ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --count 50"
echo ""
echo "3. Different RNG seed (for variation):"
echo "   ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --seed 99999"
echo ""
echo "4. Combination:"
echo "   ALLOW_TEST_SEED=true npm run seed:members -- --email info.vedweb@gmail.com --count 200 --seed 42"
echo ""
echo "================================================"
echo ""

# Ask user which option
read -p "Enter email to seed for (or 'q' to quit): " email

if [ "$email" = "q" ] || [ -z "$email" ]; then
    echo "Cancelled."
    exit 0
fi

read -p "Enter count (default 100): " count
count=${count:-100}

read -p "Enter seed (default 12345): " seed
seed=${seed:-12345}

echo ""
echo "🚀 Running seed command..."
echo "   Email: $email"
echo "   Count: $count"
echo "   Seed:  $seed"
echo ""

# Execute the seed command
ALLOW_TEST_SEED=true npm run seed:members -- --email "$email" --count "$count" --seed "$seed"

echo ""
echo "================================================"
echo "✅ Seed command completed!"
echo ""
echo "🧪 Verification steps:"
echo ""
echo "1. Check dashboard:"
echo "   GET /api/mobile/dashboard/summary"
echo ""
echo "2. Check active members:"
echo "   GET /api/mobile/members?status=ACTIVE"
echo ""
echo "3. Check passive members:"
echo "   GET /api/mobile/members?status=PASSIVE"
echo ""
echo "4. Check expired members:"
echo "   GET /api/mobile/members?expired=true"
echo ""
echo "5. Check expiring soon (7 days):"
echo "   GET /api/mobile/members?expiringDays=7"
echo ""
echo "================================================"
