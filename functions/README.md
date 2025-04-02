# Whispy Cloud Functions

This directory contains Google Cloud Functions for the Whispy application.

## Setup

1. Install Firebase CLI globally (if not already installed):
   ```
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```
   firebase login
   ```

3. Install dependencies:
   ```
   cd functions
   npm install
   ```

## Local Development

1. Build the TypeScript code:
   ```
   npm run build
   ```

2. Run the Firebase emulator:
   ```
   npm run serve
   ```

   This will start the Firebase emulator suite, allowing you to test your functions locally.
   The emulator typically runs at http://localhost:5001

## Deployment

To deploy your functions to Google Cloud:

```
npm run deploy
```

Or from the project root:

```
firebase deploy --only functions
```

## Available Functions

### HTTP Functions

- **helloWorld**: A simple HTTP function that returns a greeting message
  - Endpoint: `https://us-central1-[YOUR-PROJECT-ID].cloudfunctions.net/helloWorld`
  - Query parameters: `name` (optional)

### Scheduled Functions

- **scheduledFunction**: Runs daily at midnight (Pacific Time)

### Firestore Triggers

- **onNewDocument**: Triggered when a new document is created in the 'collection' collection

## Adding New Functions

1. Add your function to `src/index.ts`
2. Build the TypeScript code: `npm run build`
3. Test locally using the emulator
4. Deploy to production

## Environment Variables

To use environment variables:

1. Create a `.env` file in the `functions` directory
2. Add your variables in the format `KEY=VALUE`
3. Access in code using `process.env.KEY`

For production, set environment variables using:

```
firebase functions:config:set key=value
```

And access them in code using:

```typescript
const value = functions.config().key;
```
