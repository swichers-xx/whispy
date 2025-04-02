#!/bin/bash
set -e

echo "🚀 Starting deployment process..."

# 1. Fix dependency issues
echo "🔧 Fixing dependency issues..."
npm install ts-interface-checker@latest --force
npm install tailwindcss@latest postcss@latest autoprefixer@latest --force

# 2. Deploy PartyKit server first (doesn't depend on Next.js build)
echo "🎈 Deploying PartyKit server..."
npx partykit deploy

# 3. Deploy Firebase functions
echo "🔥 Deploying Firebase functions..."
cd functions
npm run build
cd ..
firebase deploy --only functions

# 4. Create a simple public directory for Firebase hosting
echo "📁 Creating simplified public directory for hosting..."
mkdir -p public_deploy
cat > public_deploy/index.html << EOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YodieGang Chat</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(to bottom right, #4b0082, #000066);
      color: white;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 800px;
      text-align: center;
      background-color: rgba(0, 0, 0, 0.3);
      padding: 30px;
      border-radius: 10px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 20px;
    }
    p {
      font-size: 1.2rem;
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      background: linear-gradient(to right, #8a2be2, #4169e1);
      color: white;
      padding: 12px 24px;
      border-radius: 30px;
      text-decoration: none;
      font-weight: bold;
      transition: all 0.3s;
    }
    .button:hover {
      transform: scale(1.05);
      box-shadow: 0 0 15px rgba(138, 43, 226, 0.6);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>YodieGang Chat</h1>
    <p>Our chat application is hosted on PartyKit for real-time functionality.</p>
    <a class="button" href="https://the-dl.swichers-xx.partykit.dev" target="_blank">Launch YodieGang Chat</a>
  </div>
</body>
</html>
EOF

# 5. Update firebase.json to use the simplified public directory
sed -i 's/"public": "out"/"public": "public_deploy"/g' firebase.json

# 6. Deploy Firebase hosting, Firestore rules, and Storage rules
echo "🌐 Deploying Firebase hosting and security rules..."
firebase deploy --only hosting,firestore,storage

echo "✅ Deployment completed successfully!"
