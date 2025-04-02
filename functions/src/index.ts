import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

// Create and deploy a simple HTTP function
export const helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info('Hello logs!', {structuredData: true});
  response.json({
    message: 'Hello from Whispy Cloud Functions!',
    timestamp: new Date().toISOString(),
    query: request.query
  });
});

// Example of a scheduled function that runs every day at midnight
export const scheduledFunction = functions.pubsub.schedule('0 0 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async (context) => {
    functions.logger.info('This will run every day at midnight!');
    // Add your scheduled task logic here
    return null;
  });

// Example of a Firestore trigger function
export const onNewDocument = functions.firestore
  .document('collection/{docId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    functions.logger.info('New document created:', context.params.docId, data);
    // Add your document creation logic here
    return null;
  });

// Export all Firestore functions
export * from './firestore-functions';
