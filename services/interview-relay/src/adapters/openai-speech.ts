import WebSocket from "ws";
import { OpenAISpeechCore, type SpeechSocket } from "./openai-speech-core.js";

/** Legacy Node transport. The Worker imports only the shared processing core. */
export class OpenAISpeech extends OpenAISpeechCore {
  constructor(key: string, connect: (key: string) => SpeechSocket = key => new WebSocket(
    "wss://api.openai.com/v1/realtime?intent=transcription",
    { headers: { Authorization: `Bearer ${key}` }, maxPayload: 65536, handshakeTimeout: 10000, followRedirects: false },
  )) { super(key, connect); }
}
