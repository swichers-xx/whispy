declare module "partysocket" {
  interface PartySocketOptions {
    host: string;
    room: string;
  }

  export default class PartySocket extends WebSocket {
    constructor(options: PartySocketOptions);
  }
}
