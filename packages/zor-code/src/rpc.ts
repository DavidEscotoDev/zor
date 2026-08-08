import { createZorAgent } from './agent/create';
import { loadConfig } from './config';
import { SessionManager, SessionData } from './session/manager';
import { logger } from './utils/logger';
import { resolveSessionDir } from './project';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;

let agent: any = null;
let session: SessionData | undefined;
let sessionManager: SessionManager;

async function initializeAgent(config: any, existingSession?: SessionData) {
  const mgr = new SessionManager(resolveSessionDir(config.session.dir));
  const sess = existingSession || mgr.create();
  mgr.prune(1000);
  sessionManager = mgr;
  session = sess;

  const { agent: newAgent, mcpErrors } = await createZorAgent(config, sess);
  agent = newAgent;

  if (mcpErrors.length > 0) {
    logger.warn('MCP warnings', { errors: mcpErrors });
  }

  agent.subscribe((event: any) => {
    if (event.type === 'turn_end' && event.message) {
      try {
        if (session) {
          session.messages = agent.state.messages;
          sessionManager.save(session);
        }
      } catch (e: any) {
        logger.error('Failed to save session', { error: e.message });
      }
    }
  });

  return agent;
}

async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        const config = loadConfig();
        const loaded = params?.sessionId ? sessionManager.load(params.sessionId) : undefined;
        const existingSession = loaded || undefined;
        await initializeAgent(config, existingSession);
        return { jsonrpc: '2.0', id, result: { status: 'ready', sessionId: session?.id } };
      }

      case 'prompt': {
        if (!agent) {
          return { jsonrpc: '2.0', id, error: { code: -32000, message: 'Agent not initialized. Call initialize first.' } };
        }
        const text = params?.text;
        if (!text) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing text parameter' } };
        }
        agent.prompt(text);
        return { jsonrpc: '2.0', id, result: { status: 'prompt_sent' } };
      }

      case 'interrupt': {
        if (!agent) {
          return { jsonrpc: '2.0', id, error: { code: -32000, message: 'Agent not initialized' } };
        }
        agent.abort();
        return { jsonrpc: '2.0', id, result: { status: 'interrupted' } };
      }

      case 'getStatus': {
        if (!agent) {
          return { jsonrpc: '2.0', id, result: { status: 'not_initialized' } };
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            status: agent.state.isStreaming ? 'processing' : 'idle',
            model: agent.state.model?.id,
            thinkingLevel: agent.state.thinkingLevel,
            toolsCount: agent.state.tools?.length,
            messagesCount: agent.state.messages?.length,
            pendingToolCalls: agent.state.pendingToolCalls?.size,
            sessionId: session?.id,
          },
        };
      }

      case 'setConfig': {
        if (!agent) {
          return { jsonrpc: '2.0', id, error: { code: -32000, message: 'Agent not initialized' } };
        }
        const config = loadConfig();
        if (params?.model) config.model = params.model;
        if (params?.effort) config.effort = params.effort;
        if (params?.permissions) config.permissions = params.permissions;
        if (params?.theme) config.theme = params.theme;
        await initializeAgent(config);
        return { jsonrpc: '2.0', id, result: { status: 'config_updated' } };
      }

      case 'listTools': {
        if (!agent) {
          return { jsonrpc: '2.0', id, error: { code: -32000, message: 'Agent not initialized' } };
        }
        return {
          jsonrpc: '2.0',
          id,
          result: agent.state.tools?.map((t: any) => ({ name: t.name, description: t.description })) || [],
        };
      }

      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (e: any) {
    logger.error('RPC request error', { method, error: e.message });
    return { jsonrpc: '2.0', id, error: { code: -32603, message: e.message } };
  }
}

function sendResponse(response: JsonRpcResponse) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendNotification(method: string, params?: any) {
  const notification: JsonRpcNotification = { jsonrpc: '2.0', method, params };
  process.stdout.write(JSON.stringify(notification) + '\n');
}

export async function runRpc() {
  process.stdin.setEncoding('utf8');
  
  let buffer = '';
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let lineEnd;
    while ((lineEnd = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);
      if (!line) continue;
      
      try {
        const message: JsonRpcMessage = JSON.parse(line);
        if ('id' in message) {
          const request = message as JsonRpcRequest;
          handleRequest(request).then(sendResponse).catch(err => {
            sendResponse({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: err.message } });
          });
        } else if ('method' in message) {
          // Handle notifications if needed
        }
      } catch (e: any) {
        sendResponse({ jsonrpc: '2.0', id: 0, error: { code: -32700, message: 'Parse error' } });
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });

  // Send ready notification
  sendNotification('ready', { version: '1.0.0' });
}