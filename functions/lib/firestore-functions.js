"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMessage = exports.getMessages = exports.createMessage = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    try {
        admin.initializeApp();
    }
    catch (error) {
        console.log('Firebase admin initialization error:', error);
    }
}
// Mock data for testing when Firestore is not available
const mockMessages = [
    {
        id: 'msg1',
        text: 'Welcome to the chat!',
        sender: 'System',
        room: 'default',
        timestamp: new Date().toISOString()
    },
    {
        id: 'msg2',
        text: 'This is a mock message for testing',
        sender: 'TestBot',
        room: 'default',
        timestamp: new Date().toISOString()
    }
];
// Create a new message in Firestore
exports.createMessage = functions.https.onRequest(async (request, response) => {
    try {
        // Check if the request method is POST
        if (request.method !== 'POST') {
            response.status(405).send('Method Not Allowed');
            return;
        }
        // Get the message data from the request body
        const { text, sender, room = 'default' } = request.body;
        // Validate the required fields
        if (!text || !sender) {
            response.status(400).send('Missing required fields: text and sender are required');
            return;
        }
        // Create a new message document
        const message = {
            text,
            sender,
            room,
            timestamp: new Date().toISOString(),
        };
        try {
            // Try to use Firestore if available
            const db = admin.firestore();
            const docRef = await db.collection('messages').add(message);
            // Return the created message with its ID
            response.status(201).json(Object.assign({ id: docRef.id }, message));
        }
        catch (firestoreError) {
            console.log('Firestore error, using mock data instead:', firestoreError);
            // If Firestore fails, return a mock response
            const mockId = `mock-${Date.now()}`;
            response.status(201).json(Object.assign(Object.assign({ id: mockId }, message), { _note: "This is a mock response as Firestore is not available" }));
        }
    }
    catch (error) {
        functions.logger.error('Error creating message:', error);
        response.status(500).send('Internal Server Error');
    }
});
// Get messages for a specific room
exports.getMessages = functions.https.onRequest(async (request, response) => {
    try {
        // Get the room parameter from the query string
        const room = request.query.room || 'default';
        const limit = parseInt(request.query.limit || '50', 10);
        try {
            // Try to use Firestore if available
            const db = admin.firestore();
            const messagesSnapshot = await db.collection('messages')
                .where('room', '==', room)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            // Transform the data
            const messages = messagesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            // Return the messages
            response.status(200).json({ messages });
        }
        catch (firestoreError) {
            console.log('Firestore error, using mock data instead:', firestoreError);
            // If Firestore fails, return mock messages
            const filteredMockMessages = mockMessages
                .filter(msg => msg.room === room)
                .slice(0, limit);
            response.status(200).json({
                messages: filteredMockMessages,
                _note: "This is a mock response as Firestore is not available"
            });
        }
    }
    catch (error) {
        functions.logger.error('Error getting messages:', error);
        response.status(500).send('Internal Server Error');
    }
});
// Delete a message
exports.deleteMessage = functions.https.onRequest(async (request, response) => {
    try {
        // Check if the request method is DELETE
        if (request.method !== 'DELETE') {
            response.status(405).send('Method Not Allowed');
            return;
        }
        // Get the message ID from the request parameters
        const messageId = request.query.id;
        if (!messageId) {
            response.status(400).send('Missing required parameter: id');
            return;
        }
        try {
            // Try to use Firestore if available
            const db = admin.firestore();
            await db.collection('messages').doc(messageId).delete();
            // Return success
            response.status(200).json({ success: true, id: messageId });
        }
        catch (firestoreError) {
            console.log('Firestore error, using mock response instead:', firestoreError);
            // If Firestore fails, return a mock success response
            response.status(200).json({
                success: true,
                id: messageId,
                _note: "This is a mock response as Firestore is not available"
            });
        }
    }
    catch (error) {
        functions.logger.error('Error deleting message:', error);
        response.status(500).send('Internal Server Error');
    }
});
//# sourceMappingURL=firestore-functions.js.map