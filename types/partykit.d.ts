declare module "partykit" {
  export interface Party {
    id: string;
    broadcast(message: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  }

  export interface Connection {
    id: string;
    send(message: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  }

  export interface ConnectionContext {
    request: Request;
  }

  export interface Server {
    party: Party;
    onConnect?(connection: Connection, ctx: ConnectionContext): void | Promise<void>;
    onMessage?(message: string, sender: Connection): void | Promise<void>;
    onClose?(connection: Connection): void | Promise<void>;
  }
}
