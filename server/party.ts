import type * as Party from "partykit";

interface BaseMessage {
  id: string;
  type: string;
  sender: string;
  timestamp: number;
}

interface TextMessage extends BaseMessage {
  type: "text";
  text: string;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  readBy?: string[];
}

interface MediaMessage extends BaseMessage {
  type: "media";
  mediaType: "image" | "video" | "audio";
  url: string;
  caption?: string;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  readBy?: string[];
}

interface SystemMessage extends BaseMessage {
  type: "system";
  action: "joined" | "left" | "typing" | "read" | "reaction";
  targetMessageId?: string;
  reaction?: string;
}

type Message = TextMessage | MediaMessage | SystemMessage;

interface User {
  id: string;
  name: string;
  lastSeen: number;
  isTyping: boolean;
}

export default class TheDLParty implements Party.Server {
  messages: Message[] = [];
  users: Map<string, User> = new Map();
  party: Party.Party;

  constructor(party: Party.Party) {
    this.party = party;
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Send message history
    this.messages
      .filter(m => m.type !== "system")
      .forEach((message) => {
        conn.send(JSON.stringify(message));
      });

    // Send current user list
    const userList = Array.from(this.users.values());
    conn.send(JSON.stringify({
      type: "system",
      action: "userList",
      users: userList,
      timestamp: Date.now()
    }));
  }

  async onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case "text":
        case "media":
          // Add message ID if not present
          if (!data.id) {
            data.id = crypto.randomUUID();
          }
          this.messages.push(data);
          this.party.broadcast(JSON.stringify(data));
          break;

        case "system":
          switch (data.action) {
            case "joined":
              this.users.set(sender.id, {
                id: sender.id,
                name: data.sender,
                lastSeen: Date.now(),
                isTyping: false
              });
              this.broadcastUserList();
              break;

            case "left":
              this.users.delete(sender.id);
              this.broadcastUserList();
              break;

            case "typing":
              const user = this.users.get(sender.id);
              if (user) {
                user.isTyping = data.isTyping;
                this.users.set(sender.id, user);
                this.broadcastUserList();
              }
              break;

            case "read":
              if (data.targetMessageId) {
                this.markMessageAsRead(data.targetMessageId, data.sender);
              }
              break;

            case "reaction":
              if (data.targetMessageId && data.reaction) {
                this.addReaction(data.targetMessageId, data.sender, data.reaction);
              }
              break;
          }
          break;
      }
    } catch (e) {
      console.error("Error processing message:", e);
    }
  }

  async onClose(conn: Party.Connection) {
    this.users.delete(conn.id);
    this.broadcastUserList();
  }

  private broadcastUserList() {
    const userList = Array.from(this.users.values());
    this.party.broadcast(JSON.stringify({
      type: "system",
      action: "userList",
      users: userList,
      timestamp: Date.now()
    }));
  }

  private markMessageAsRead(messageId: string, userId: string) {
    const message = this.messages.find(m => m.id === messageId);
    if (message && message.type !== "system") {
      if (!message.readBy) {
        message.readBy = [];
      }
      if (!message.readBy.includes(userId)) {
        message.readBy.push(userId);
        this.party.broadcast(JSON.stringify({
          type: "system",
          action: "read",
          targetMessageId: messageId,
          sender: userId,
          timestamp: Date.now()
        }));
      }
    }
  }

  private addReaction(messageId: string, userId: string, reaction: string) {
    const message = this.messages.find(m => m.id === messageId);
    if (message && message.type !== "system") {
      if (!message.reactions) {
        message.reactions = {};
      }
      if (!message.reactions[reaction]) {
        message.reactions[reaction] = [];
      }
      if (!message.reactions[reaction].includes(userId)) {
        message.reactions[reaction].push(userId);
        this.party.broadcast(JSON.stringify({
          type: "system",
          action: "reaction",
          targetMessageId: messageId,
          reaction,
          sender: userId,
          timestamp: Date.now()
        }));
      }
    }
  }
}
