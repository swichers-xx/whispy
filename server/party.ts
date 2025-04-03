import type * as Party from "partykit/server"; // Use partykit/server for correct types
import type { PartyServer, PartyKitRoom } from "partykit/server"; // Correct type is PartyKitRoom

// Placeholder - MUST be replaced with a secure method
const ADMIN_PASSWORD = 'yodieadmin';

// Rating Constants
const RATING_HARSH = -1; // Bad
const RATING_BLINKERS = 1; // Good

// --- Types Definition ---

interface AdminSettings {
  welcomeMessage?: string;
  allowMediaUploads?: boolean;
  allowReactions?: boolean;
  bannedWords?: string[]; // Added for content filtering
  maxMessageHistory?: number; // Added for configuration
}

const DEFAULT_SETTINGS: AdminSettings = {
  welcomeMessage: "Welcome to the Yodie Gang Chat!",
  allowMediaUploads: true,
  allowReactions: true,
  bannedWords: [],
  maxMessageHistory: 100, // Default history size
};

interface BaseMessage {
  id: string;
  type: string;
  sender: string; // User-provided name
  userId: string; // Connection ID
  timestamp: number;
  expiresAt?: number; // Timestamp when message should expire
  maxViews?: number; // Maximum number of views before self-destructing
  viewCount?: number; // Current view count
  requireConfirmation?: boolean; // Whether to require confirmation before viewing
  isHidden?: boolean; // Whether the message is hidden (after expiration or max views)
  oneTimeView?: boolean; // Whether each user can only view the message once
  viewedBy?: string[]; // List of user IDs who have viewed the message
  threadId?: string; // ID of the thread this message belongs to
  isThreadStarter?: boolean; // Whether this message starts a thread
  threadMessageCount?: number; // Count of messages in this thread
}

interface TextMessage extends BaseMessage {
  type: "text";
  text: string;
  formattedText?: boolean; // Whether the text contains formatting
  replyTo?: string;
  reactions?: { [emoji: string]: string[] }; // userId[]
  readBy?: string[]; // userId[]
  ratings?: { [raterUserId: string]: number }; // +1 for Blinkers, -1 for Harsh
  ratingScore?: number; // Aggregate score
}

interface MediaMessage extends BaseMessage {
  type: "media";
  mediaType: "image" | "video" | "audio" | "voice"; // Added voice type
  url: string;
  duration?: number; // Duration in seconds for audio/voice messages
  caption?: string;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] }; // userId[]
  readBy?: string[]; // userId[]
  ratings?: { [raterUserId: string]: number }; // +1 for Blinkers, -1 for Harsh
  ratingScore?: number; // Aggregate score
}

// For broadcasting state to clients
interface SystemInfoMessage {
  type: "systemInfo"; // Renamed for clarity
  action: "userList" | "typing" | "read" | "reactionUpdate" | "messageDeleted" | "error" | "messageRatingUpdate" | "userRankingUpdate" | "messageExpired" | "messageViewed" | "confirmView" | "messageAlreadyViewed" | "threadUpdate"; // Added threadUpdate
  // Conditional fields based on action:
  users?: UserInfo[];
  userId?: string;
  sender?: string;
  isTyping?: boolean;
  targetMessageId?: string;
  reactions?: { [emoji: string]: string[] };
  ratings?: { [raterUserId: string]: number };
  ratingScore?: number;
  rankingScore?: number;
  message?: string;
  timestamp: number;
  viewerId?: string;
  threadId?: string; // ID of the thread that was updated
  threadMessageCount?: number; // Updated count of messages in the thread
}

// For receiving actions from clients
interface ClientActionMessage {
  type: "clientAction";
  action: "join" | "typing" | "read" | "react" | "deleteMessage" | "rateMessage" | "confirmView" | "viewMessage" | "createThread" | "replyInThread";
  sender?: string;
  isTyping?: boolean;
  targetMessageId?: string;
  reaction?: string;
  rating?: number;
  password?: string;
  threadId?: string; // ID of the thread to reply to
}

// For admin settings management
interface GetSettingsMessage { type: "getSettings"; }
interface AdminUpdateMessage { type: "adminUpdate"; password?: string; settings: Partial<AdminSettings>; }
interface SettingsUpdateMessage { type: "settingsUpdate"; settings: AdminSettings; }

// Union Types
type StoredMessage = TextMessage | MediaMessage;
type BroadcastMessage = StoredMessage | SystemInfoMessage | SettingsUpdateMessage;
type IncomingClientMessage = StoredMessage | ClientActionMessage | GetSettingsMessage | AdminUpdateMessage;

// User Info (subset sent to clients)
interface UserInfo {
  id: string;
  name: string;
  isTyping?: boolean;
  rankingScore?: number; // Added ranking score
}

// Internal User State
interface UserState {
  id: string;
  name: string;
  lastSeen: number;
  isTyping: boolean;
  rankingScore: number; // Added ranking score
}

// --- Party Server Class ---

export default class TheDLParty implements PartyServer {
  messages: StoredMessage[] = [];
  users: Map<string, UserState> = new Map(); // Store full UserState internally
  room: PartyKitRoom; // Use the correct PartyKitRoom type
  adminSettings: AdminSettings = { ...DEFAULT_SETTINGS };

  constructor(room: PartyKitRoom) { // Use the correct PartyKitRoom type
    this.room = room;
  }

  async onStart() {
    // Load messages and settings from storage using this.room.storage
    this.messages = await this.room.storage.get<StoredMessage[]>("messages") ?? [];
    this.adminSettings = await this.room.storage.get<AdminSettings>("admin_settings") ?? { ...DEFAULT_SETTINGS };
    console.log("Server started. Loaded settings:", this.adminSettings);
    console.log(`Loaded ${this.messages.length} messages.`);
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`Connected: ${conn.id}`);
    
    // Add user to the users map with default values
    this.users.set(conn.id, {
      id: conn.id,
      name: "Guest", // Will be updated when they join
      lastSeen: Date.now(),
      isTyping: false,
      rankingScore: 0
    });
    
    // Send message history
    this.messages.forEach((message) => {
      conn.send(JSON.stringify(message));
    });

    // Send current user list
    this.sendUserList();

    // Send current admin settings
    conn.send(JSON.stringify({ type: "settingsUpdate", settings: this.adminSettings } as SettingsUpdateMessage));
  }

  async onMessage(message: string, sender: Party.Connection) {
    try {
      const data: IncomingClientMessage = JSON.parse(message);
      // console.log("Received:", data.type, "from", sender.id); // Verbose logging

      switch (data.type) {
        case "text":
        case "media":
          await this.handleUserMessage(data, sender);
          break;

        case "clientAction":
          await this.handleClientAction(data, sender);
          break;

        case "getSettings":
          sender.send(JSON.stringify({ type: "settingsUpdate", settings: this.adminSettings } as SettingsUpdateMessage));
          break;

        case "adminUpdate":
          await this.handleAdminUpdate(data, sender);
          break;

        default:
          console.warn(`Received unknown message type: ${(data as any).type} from ${sender.id}`);
          this.sendError(sender, "Unknown message type received.");
      }
    } catch (e) {
      console.error(`Error processing message from ${sender.id}:`, message, e);
      this.sendError(sender, "Failed to process message.");
    }
  }

  async onClose(conn: Party.Connection) {
    console.log(`Disconnected: ${conn.id}`);
    const user = this.users.get(conn.id);
    if (user) {
      console.log(`User ${user.name} (${conn.id}) left.`);
    }
    this.users.delete(conn.id);
    this.broadcastUserList(); // Broadcast updated user list
  }

  // --- Message Handlers ---

  private async handleUserMessage(data: StoredMessage, sender: Party.Connection) {
    // Assign ID and timestamp if missing (should be set by client ideally)
    if (!data.id) data.id = crypto.randomUUID();
    data.timestamp = Date.now();
    data.userId = sender.id; // Ensure userId is set correctly

    // Initialize view count for self-destructing messages
    if (data.maxViews && data.maxViews > 0) {
      data.viewCount = 0;
    }

    // Validate expiration time
    if (data.expiresAt && data.expiresAt <= data.timestamp) {
      this.sendError(sender, "Expiration time must be in the future.");
      return;
    }

    // --- Validation & Moderation ---
    const user = this.users.get(sender.id);
    if (!user) {
      console.warn(`Message from unknown user ${sender.id}`);
      this.sendError(sender, "You must join first.");
      return;
    }
    data.sender = user.name; // Use stored name

    if (data.type === "media" && !this.adminSettings.allowMediaUploads) {
      console.log(`Media uploads disabled, rejecting message from ${user.name}`);
      this.sendError(sender, "Media uploads are currently disabled.");
      return;
    }

    if (data.type === "text") {
      // --- Implement Banned Word Check ---
      const bannedWords = this.adminSettings.bannedWords ?? [];
      const lowerCaseText = data.text.toLowerCase();
      if (bannedWords.some(word => lowerCaseText.includes(word.toLowerCase()))) {
        console.log(`Banned word detected in message from ${user.name}`);
        this.sendError(sender, "Your message contains inappropriate content and was blocked.");
        // Optionally notify other admins?
        return;
      }
    }
    // --- End Validation ---

    this.messages.push(data);

    // --- Implement Prune History ---
    const maxHistory = this.adminSettings.maxMessageHistory ?? 100;
    if (this.messages.length > maxHistory) {
      this.messages.splice(0, this.messages.length - maxHistory);
      // console.log(`Pruned message history to ${this.messages.length}`);
    }

    // Persist messages (optional)
    // await this.room.storage.put("messages", this.messages);

    // Broadcast the validated message
    this.room.broadcast(JSON.stringify(data));

    // Schedule expiration if needed
    if (data.expiresAt) {
      this.scheduleMessageExpiration(data);
    }
  }

  private async handleClientAction(data: ClientActionMessage, sender: Party.Connection) {
    console.log(`Client action: ${data.action} from ${sender.id}`);
    
    switch (data.action) {
      case "join":
        if (data.sender) {
          // Update user info
          const user = this.users.get(sender.id) || {
            id: sender.id,
            name: data.sender,
            lastSeen: Date.now(),
            isTyping: false,
            rankingScore: 0
          };
          user.name = data.sender;
          user.lastSeen = Date.now();
          this.users.set(sender.id, user);
          
          // Broadcast updated user list
          this.broadcastUserList();
          
          console.log(`User ${data.sender} (${sender.id}) joined.`);
          
          // Send welcome message if configured
          if (this.adminSettings.welcomeMessage) {
            sender.send(JSON.stringify({
              id: crypto.randomUUID(),
              type: "text",
              text: this.adminSettings.welcomeMessage,
              sender: "System",
              userId: "system",
              timestamp: Date.now()
            } as TextMessage));
          }
        }
        break;

      case "typing":
        if (data.isTyping !== undefined) {
          const user = this.users.get(sender.id);
          if (user) {
            user.isTyping = data.isTyping;
            user.lastSeen = Date.now();
            this.users.set(sender.id, user);
            this.broadcastUserList();
          } else { console.warn(`Typing action from unknown user ${sender.id}`); }
        }
        break;

      case "read":
        if (data.targetMessageId) {
          await this.markMessageAsRead(data.targetMessageId, sender.id);
        } else { console.warn(`Read action missing targetMessageId from ${sender.id}`); }
        break;

      case "react":
        if (data.targetMessageId && data.reaction) {
          if (!this.adminSettings.allowReactions) {
            this.sendError(sender, "Reactions are currently disabled.");
            return;
          }
          await this.addOrRemoveReaction(data.targetMessageId, sender.id, data.reaction);
        } else { console.warn(`React action missing fields from ${sender.id}`); }
        break;

      case "rateMessage":
        if (data.targetMessageId && data.rating) {
          await this.rateMessage(data.targetMessageId, sender.id, data.rating);
        } else { console.warn(`RateMessage action missing fields from ${sender.id}`); }
        break;

      case "deleteMessage":
        if (data.password !== ADMIN_PASSWORD) {
          console.warn(`Unauthorized deleteMessage attempt from ${sender.id}`);
          this.sendError(sender, "Unauthorized admin action.");
          return;
        }
        if (!data.targetMessageId) {
          console.warn(`DeleteMessage missing targetMessageId from ${sender.id}`);
          this.sendError(sender, "Message ID required for deletion.");
          return;
        }
        await this.deleteMessage(data.targetMessageId, sender.id);
        break;

      case "viewMessage":
        if (data.targetMessageId) {
          await this.handleMessageView(data.targetMessageId, sender.id, false);
        } else { console.warn(`ViewMessage action missing targetMessageId from ${sender.id}`); }
        break;
        
      case "confirmView":
        if (data.targetMessageId) {
          await this.handleMessageView(data.targetMessageId, sender.id, true);
        } else { console.warn(`ConfirmView action missing targetMessageId from ${sender.id}`); }
        break;

      case "createThread":
        if (data.targetMessageId) {
          await this.createThread(data.targetMessageId, sender.id);
        } else { console.warn(`CreateThread action missing targetMessageId from ${sender.id}`); }
        break;

      case "replyInThread":
        if (data.targetMessageId && data.threadId) {
          await this.replyInThread(data.targetMessageId, data.threadId, sender.id);
        } else { console.warn(`ReplyInThread action missing fields from ${sender.id}`); }
        break;

      default:
        const unknownAction = data as any;
        console.warn(`Received unknown client action: ${unknownAction.action} from ${sender.id}`);
        this.sendError(sender, `Unknown action: ${unknownAction.action}`);
    }
  }

  private async handleAdminUpdate(data: AdminUpdateMessage, sender: Party.Connection) {
    // **VERY INSECURE - REPLACE THIS AUTH METHOD**
    if (data.password !== ADMIN_PASSWORD) {
      console.warn(`Unauthorized adminUpdate attempt from ${sender.id}`);
      this.sendError(sender, "Unauthorized admin action.");
      return;
    }

    console.log(`Processing adminUpdate from ${sender.id}`);
    // Sanitize/Validate settings? (e.g., ensure maxMessageHistory is a positive number)
    if (data.settings.maxMessageHistory !== undefined) {
      const maxHist = Number(data.settings.maxMessageHistory);
      if (!isNaN(maxHist) && maxHist >= 0) {
        data.settings.maxMessageHistory = maxHist;
      } else {
        delete data.settings.maxMessageHistory; // Ignore invalid value
        this.sendError(sender, "Invalid value for Max Message History (must be a number >= 0).");
      }
    }
    if (data.settings.bannedWords !== undefined && !Array.isArray(data.settings.bannedWords)) {
      // Expecting an array from the client (or handle comma-separated string conversion)
      this.sendError(sender, "Invalid format for Banned Words (expected array).");
      delete data.settings.bannedWords;
    }

    // Recalculate all user rankings if settings affecting them changed (e.g., if rating logic changes)
    // For now, settings don't directly impact existing rankings, so skipping recalculation.
    // If settings like "rating weight" were added, we'd need: await this.recalculateAllUserRankings();

    // Merge changes into current settings
    this.adminSettings = { ...this.adminSettings, ...data.settings };

    // Save updated settings to persistent storage
    await this.room.storage.put("admin_settings", this.adminSettings);
    console.log("Saved updated admin settings:", this.adminSettings);

    // Broadcast the updated settings to ALL connected clients
    this.room.broadcast(JSON.stringify({
      type: "settingsUpdate",
      settings: this.adminSettings
    } as SettingsUpdateMessage));
    console.log("Broadcasted settingsUpdate to all clients");
    // Optionally send confirmation back to admin?
    // sender.send(JSON.stringify({ type: "settingsUpdateSuccess", settings: this.adminSettings }));
  }

  // --- Utility Functions ---

  private calculateMessageScore(message: StoredMessage): number {
    if (!message.ratings) return 0;
    return Object.values(message.ratings).reduce((sum, rating) => sum + rating, 0);
  }

  private calculateUserRanking(userId: string): number {
    return this.messages
      .filter(msg => msg.userId === userId && msg.ratingScore !== undefined)
      .reduce((sum, msg) => sum + (msg.ratingScore ?? 0), 0);
  }

  private async updateUserRanking(userId: string) {
    const user = this.users.get(userId);
    if (!user) return; // User not connected

    const newRankingScore = this.calculateUserRanking(userId);

    if (user.rankingScore !== newRankingScore) {
      user.rankingScore = newRankingScore;
      this.users.set(userId, user);

      // Persist user score? (e.g., this.room.storage.put(`user_score_${userId}`, newRankingScore));

      // Broadcast the update
      this.room.broadcast(JSON.stringify({
        type: "systemInfo",
        action: "userRankingUpdate",
        userId: userId,
        rankingScore: newRankingScore,
        timestamp: Date.now()
      } as SystemInfoMessage));
      console.log(`User ${user.name} ranking updated to ${newRankingScore}`);
    }
  }

  // Send user list to all connections or a specific connection
  private sendUserList(conn?: Party.Connection) {
    // Convert internal user state to client-facing user info
    const userList: UserInfo[] = Array.from(this.users.values()).map(user => ({
      id: user.id,
      name: user.name,
      isTyping: user.isTyping,
      rankingScore: user.rankingScore
    }));
    
    const message: SystemInfoMessage = {
      type: "systemInfo",
      action: "userList",
      users: userList,
      timestamp: Date.now()
    };
    
    if (conn) {
      // Send to specific connection
      conn.send(JSON.stringify(message));
    } else {
      // Broadcast to all connections
      this.broadcastUserList();
    }
  }
  
  // Broadcast user list to all connections
  private broadcastUserList() {
    // Convert internal user state to client-facing user info
    const userList: UserInfo[] = Array.from(this.users.values()).map(user => ({
      id: user.id,
      name: user.name,
      isTyping: user.isTyping,
      rankingScore: user.rankingScore
    }));
    
    const message: SystemInfoMessage = {
      type: "systemInfo",
      action: "userList",
      users: userList,
      timestamp: Date.now()
    };
    
    this.room.broadcast(JSON.stringify(message));
  }

  private async markMessageAsRead(messageId: string, userId: string) {
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
      const message = this.messages[messageIndex];
      if (!message.readBy) message.readBy = [];

      if (!message.readBy.includes(userId)) {
        message.readBy.push(userId);
        // Persist changes if storing messages
        // await this.room.storage.put("messages", this.messages);

        this.room.broadcast(JSON.stringify({
          type: "systemInfo",
          action: "read",
          targetMessageId: messageId,
          userId: userId,
          timestamp: Date.now()
        } as SystemInfoMessage));
      } // else already read
    } else {
      console.warn(`Message not found for read receipt: ${messageId}`);
    }
  }

  private async addOrRemoveReaction(messageId: string, userId: string, reaction: string) {
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
      const message = this.messages[messageIndex];
      if (!message.reactions) message.reactions = {};
      if (!message.reactions[reaction]) message.reactions[reaction] = [];

      const userIndex = message.reactions[reaction].indexOf(userId);
      if (userIndex === -1) {
        message.reactions[reaction].push(userId); // Add reaction
      } else {
        message.reactions[reaction].splice(userIndex, 1); // Remove reaction
        if (message.reactions[reaction].length === 0) {
          delete message.reactions[reaction]; // Clean up empty reaction array
        }
      }
      // Persist changes if storing messages
      // await this.room.storage.put("messages", this.messages);

      // Broadcast the entire updated reaction state for the message
      this.room.broadcast(JSON.stringify({
        type: "systemInfo",
        action: "reactionUpdate",
        targetMessageId: messageId,
        reactions: message.reactions ?? {}, // Ensure always sending an object
        timestamp: Date.now()
      } as SystemInfoMessage));
    } else {
      console.warn(`Message not found for reaction: ${messageId}`);
    }
  }

  private async rateMessage(targetMessageId: string, raterUserId: string, rating: number) {
    const messageIndex = this.messages.findIndex(m => m.id === targetMessageId);
    if (messageIndex === -1) {
      console.warn(`User ${raterUserId} tried to rate non-existent message ${targetMessageId}`);
      // Send error back to rater?
      return;
    }

    const message = this.messages[messageIndex];

    // Prevent self-rating
    if (message.userId === raterUserId) {
      console.warn(`User ${raterUserId} tried to rate their own message ${targetMessageId}`);
      // Send error back to rater?
      return;
    }

    // Ensure valid rating value
    if (rating !== RATING_HARSH && rating !== RATING_BLINKERS) {
      console.warn(`Invalid rating value ${rating} from ${raterUserId} for message ${targetMessageId}`);
      // Send error back to rater?
      return;
    }

    if (!message.ratings) message.ratings = {};

    // Store or update the rating
    message.ratings[raterUserId] = rating;

    // Recalculate the aggregate score for the message
    const oldScore = message.ratingScore;
    message.ratingScore = this.calculateMessageScore(message);

    console.log(`User ${raterUserId} rated message ${targetMessageId} with ${rating > 0 ? 'Blinkers (+1)' : 'Harsh (-1)'}. New score: ${message.ratingScore}`);

    // Persist message changes (if storing messages)
    // await this.room.storage.put("messages", this.messages);

    // Broadcast message rating update
    this.room.broadcast(JSON.stringify({
      type: "systemInfo",
      action: "messageRatingUpdate",
      targetMessageId: targetMessageId,
      ratings: message.ratings,
      ratingScore: message.ratingScore,
      timestamp: Date.now()
    } as SystemInfoMessage));

    // Update the message author's ranking score if the message score changed
    if (oldScore !== message.ratingScore) {
      await this.updateUserRanking(message.userId);
    }
  }

  private async deleteMessage(messageId: string, adminUserId: string) {
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
      const deletedMessage = this.messages.splice(messageIndex, 1)[0];
      console.log(`Admin ${adminUserId} deleted message ${messageId} from ${deletedMessage.sender}`);

      // Persist changes if storing messages
      // await this.room.storage.put("messages", this.messages);

      // Broadcast deletion event
      this.room.broadcast(JSON.stringify({
        type: "systemInfo",
        action: "messageDeleted",
        targetMessageId: messageId,
        timestamp: Date.now()
      } as SystemInfoMessage));
    } else {
      console.warn(`Admin ${adminUserId} tried to delete non-existent message ${messageId}`);
      const adminConn = this.room.getConnection(adminUserId);
      if (adminConn) this.sendError(adminConn, `Message with ID ${messageId} not found for deletion.`);
    }
  }

  private sendError(connection: Party.Connection, errorMessage: string) {
    connection.send(JSON.stringify({
      type: "systemInfo",
      action: "error",
      message: errorMessage,
      timestamp: Date.now()
    } as SystemInfoMessage));
  }

  // Handle message viewing and confirmation
  private async handleMessageView(messageId: string, viewerId: string, confirmed: boolean = false) {
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const message = this.messages[messageIndex];
    
    // Check if this is a one-time view message and the user has already viewed it
    if (message.oneTimeView && message.viewedBy && message.viewedBy.includes(viewerId)) {
      // Send a notification that this message has already been viewed
      const conn = this.room.getConnection(viewerId);
      if (conn) {
        conn.send(JSON.stringify({
          type: "systemInfo",
          action: "messageAlreadyViewed",
          targetMessageId: messageId,
          sender: message.sender,
          timestamp: Date.now()
        } as SystemInfoMessage));
      }
      return;
    }
    
    // If message requires confirmation and not confirmed yet, send confirmation request
    if (message.requireConfirmation && !confirmed) {
      // Send confirmation request to the viewer
      const conn = this.room.getConnection(viewerId);
      if (conn) {
        conn.send(JSON.stringify({
          type: "systemInfo",
          action: "confirmView",
          targetMessageId: messageId,
          sender: message.sender,
          timestamp: Date.now()
        } as SystemInfoMessage));
      }
      return;
    }
    
    // Track who has viewed the message for one-time viewing
    if (message.oneTimeView) {
      if (!message.viewedBy) message.viewedBy = [];
      if (!message.viewedBy.includes(viewerId)) {
        message.viewedBy.push(viewerId);
      }
    }
    
    // Increment view count
    if (message.maxViews) {
      message.viewCount = (message.viewCount || 0) + 1;
      
      // Broadcast that the message was viewed
      this.room.broadcast(JSON.stringify({
        type: "systemInfo",
        action: "messageViewed",
        targetMessageId: messageId,
        viewerId: viewerId,
        timestamp: Date.now()
      } as SystemInfoMessage));
      
      // Check if max views reached
      if (message.viewCount >= message.maxViews) {
        message.isHidden = true;
        
        // Notify that the message expired due to max views
        this.room.broadcast(JSON.stringify({
          type: "systemInfo",
          action: "messageExpired",
          targetMessageId: messageId,
          timestamp: Date.now()
        } as SystemInfoMessage));
      }
    }
    
    // Update the message in storage
    this.messages[messageIndex] = message;
    this.saveMessages();
  }

  // Schedule message expiration
  private scheduleMessageExpiration(message: StoredMessage) {
    const now = Date.now();
    if (message.expiresAt && message.expiresAt > now) {
      const timeUntilExpiration = message.expiresAt - now;
      
      // Schedule expiration
      setTimeout(() => {
        const messageIndex = this.messages.findIndex(m => m.id === message.id);
        if (messageIndex !== -1) {
          // Mark message as hidden
          this.messages[messageIndex].isHidden = true;
          
          // Notify clients that the message expired
          this.room.broadcast(JSON.stringify({
            type: "systemInfo",
            action: "messageExpired",
            targetMessageId: message.id,
            timestamp: Date.now()
          } as SystemInfoMessage));
          
          // Save updated messages
          this.saveMessages();
        }
      }, Math.min(timeUntilExpiration, 2147483647)); // Limit to max setTimeout value
    }
  }

  // Save messages to persistent storage
  private async saveMessages() {
    try {
      await this.room.storage.put("messages", this.messages);
      console.log(`Saved ${this.messages.length} messages to storage.`);
    } catch (error) {
      console.error("Error saving messages:", error);
    }
  }

  private async createThread(messageId: string, creatorId: string) {
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      console.warn(`Message not found for thread creation: ${messageId}`);
      return;
    }

    const message = this.messages[messageIndex];
    message.threadId = crypto.randomUUID();
    message.isThreadStarter = true;
    message.threadMessageCount = 1;

    // Persist changes if storing messages
    // await this.room.storage.put("messages", this.messages);

    // Broadcast thread creation
    this.room.broadcast(JSON.stringify({
      type: "systemInfo",
      action: "threadUpdate",
      threadId: message.threadId,
      threadMessageCount: message.threadMessageCount,
      timestamp: Date.now()
    } as SystemInfoMessage));
  }

  private async replyInThread(messageId: string, threadId: string, replierId: string) {
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      console.warn(`Message not found for reply in thread: ${messageId}`);
      return;
    }

    const message = this.messages[messageIndex];
    message.threadId = threadId;

    // Find the thread starter message
    const threadStarterIndex = this.messages.findIndex(m => m.threadId === threadId && m.isThreadStarter);
    if (threadStarterIndex === -1) {
      console.warn(`Thread starter message not found for reply: ${threadId}`);
      return;
    }

    const threadStarter = this.messages[threadStarterIndex];
    threadStarter.threadMessageCount = (threadStarter.threadMessageCount || 0) + 1;

    // Persist changes if storing messages
    // await this.room.storage.put("messages", this.messages);

    // Broadcast thread update
    this.room.broadcast(JSON.stringify({
      type: "systemInfo",
      action: "threadUpdate",
      threadId: threadId,
      threadMessageCount: threadStarter.threadMessageCount,
      timestamp: Date.now()
    } as SystemInfoMessage));
  }
}
