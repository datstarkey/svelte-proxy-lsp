# Svelte Proxy LSP

A standalone LSP proxy service that combines the existing Svelte Language Server and TypeScript Language Server, providing a unified LSP interface for comprehensive Svelte development support with no client-side configuration complexity.

## Architecture

This proxy acts as a transparent middleware between LSP clients and the actual language servers:

```
┌─────────────────────────────────────────────────────────┐
│                    LSP Client                           │
│              (VS Code, Neovim, etc.)                   │
└─────────────────────┬───────────────────────────────────┘
                      │ LSP Protocol (Single Connection)
┌─────────────────────▼───────────────────────────────────┐
│                Svelte Proxy LSP                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              ProxyServer                        │    │
│  │                                                 │    │
│  │  ┌──────────────────┬─────────────────────────┐ │    │
│  │  │  Request Router  │   Document Manager      │ │    │
│  │  │  - Position      │   - Parse .svelte       │ │    │
│  │  │    Analysis      │   - Track Changes       │ │    │
│  │  │  - Service       │   - Sync State          │ │    │
│  │  │    Selection     │                         │ │    │
│  │  └──────────────────┴─────────────────────────┘ │    │
│  └─────────────────────────────────────────────────┘    │
│           │                                │             │
│           ▼                                ▼             │
│  ┌────────────────┐                ┌─────────────────┐   │
│  │ Svelte         │                │ TypeScript      │   │
│  │ Language       │                │ Language        │   │
│  │ Server         │                │ Server          │   │
│  │ (Process)      │                │ (Process)       │   │
│  └────────────────┘                └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## How It Works

1. **Single LSP Interface**: Clients connect to one proxy server instead of managing multiple LSP connections
2. **Intelligent Routing**: Analyzes cursor position in `.svelte` files to determine which server(s) to query
3. **Dual Server Management**: Spawns and manages both `svelte-language-server` and `typescript-language-server` as child processes
4. **TypeScript Svelte Plugin Integration**: Automatically configures the TypeScript server with the Svelte plugin for enhanced .svelte file support
5. **Response Merging**: Combines results from both servers, deduplicates, and returns unified responses
6. **Document Sync**: Keeps both servers synchronized with document changes

## Position-Based Routing

The proxy intelligently routes requests based on where your cursor is:

- **Script blocks** (`<script>` tags): Routes to TypeScript Language Server
- **Template/markup**: Routes to Svelte Language Server  
- **Style blocks** (`<style>` tags): Routes to Svelte Language Server
- **Document-wide operations**: Queries both servers and merges results

## Features

### Unified Language Support
- **TypeScript/JavaScript**: Full IntelliSense, type checking, refactoring in `<script>` blocks with Svelte-aware TypeScript plugin
- **Svelte Template**: Component completions, directive support, template syntax
- **CSS/SCSS**: Styling support in `<style>` blocks
- **Cross-Service**: Seamless experience switching between template and script
- **Enhanced Svelte Support**: TypeScript server understands Svelte component exports, props, and cross-file references

### LSP Capabilities
- ✅ **Completions**: Auto-complete with context-aware routing
- ✅ **Hover Information**: Type info and documentation  
- ✅ **Go to Definition**: Navigate to symbols across files
- ✅ **Find References**: Find all symbol usages
- ✅ **Signature Help**: Function parameter assistance
- ✅ **Document Symbols**: Outline view with all symbols
- ✅ **Code Actions**: Quick fixes and refactorings
- ✅ **Rename**: Rename symbols across files
- ✅ **Formatting**: Code formatting support
- ✅ **Diagnostics**: Real-time error and warning reporting

## Installation & Usage

### Prerequisites
Ensure you have the underlying language servers available:

```bash
# Install globally or make sure they're in PATH
npm install -g svelte-language-server typescript-language-server
```

### Build the Proxy
```bash
git clone <your-repo>
cd svelte-proxy-lsp
pnpm install
pnpm build
```

### Editor Configuration

#### VS Code
Add to `settings.json`:
```json
{
  "svelte.enable": false,
  "typescript.suggest.enabled": false,
  "eslint.enable": false
}
```

Then configure the proxy in your language client settings or use with a VS Code extension that points to:
```
node /path/to/svelte-proxy-lsp/dist/server.js --stdio
```

#### Neovim (nvim-lspconfig)
```lua
local lspconfig = require('lspconfig')

-- Custom LSP configuration for Svelte Proxy
lspconfig.svelteproxy = {
  default_config = {
    cmd = { 'node', '/path/to/svelte-proxy-lsp/dist/server.js', '--stdio' },
    filetypes = { 'svelte', 'typescript', 'javascript' },
    root_dir = lspconfig.util.root_pattern('package.json', 'svelte.config.js', '.git'),
    settings = {},
  },
}

-- Use the proxy
lspconfig.svelteproxy.setup{}
```

#### Emacs (lsp-mode)
```elisp
(lsp-register-client
 (make-lsp-client
  :new-connection (lsp-stdio-connection '("node" "/path/to/svelte-proxy-lsp/dist/server.js" "--stdio"))
  :major-modes '(svelte-mode typescript-mode js-mode)
  :server-id 'svelte-proxy-lsp))
```

### Command Line Testing
```bash
# Start the proxy server
node dist/server.js --stdio

# Test with a simple request (requires LSP client)
# The server will automatically spawn svelte-language-server and typescript-language-server
```

## Development

### Project Structure
```
src/
├── server.ts              # Main entry point
├── proxy/
│   ├── ProxyServer.ts     # Core proxy logic and request routing
│   └── LSPServerProcess.ts # Child process management for LSP servers
└── utils/
    └── documentParser.ts  # Svelte document parsing and region detection
```

### Key Components

#### ProxyServer
- Manages the main LSP connection with clients
- Routes requests to appropriate child servers
- Merges and deduplicates responses
- Handles document lifecycle events

#### LSPServerProcess  
- Spawns and manages child LSP server processes
- Provides JSON-RPC communication interface
- Handles server lifecycle (start, stop, error recovery)

#### Document Parser
- Parses `.svelte` files to identify script/template/style regions
- Provides position-based routing decisions
- Tracks document changes and versions

### Development Commands
```bash
pnpm build          # Compile TypeScript
pnpm dev            # Watch mode development  
pnpm clean          # Clean build artifacts
pnpm start          # Start the proxy server
```

### Testing
```bash
# Create a test Svelte file
echo '<script lang="ts">
  let name: string = "world";
  function greet() {
    console.log(`Hello ${name}!`);
  }
</script>

<main>
  <h1>Hello {name}!</h1>
  <button on:click={greet}>Greet</button>
</main>

<style>
  main { 
    text-align: center; 
    padding: 1em;
  }
</style>' > test.svelte

# Start the proxy (needs LSP client to test)
node dist/server.js --stdio
```

## Configuration

The proxy automatically detects and configures the underlying language servers. No additional configuration needed - it inherits the capabilities of both servers.

### Server Detection
The proxy automatically finds language servers in this order:
1. `svelte-language-server` via `require.resolve()`
2. `typescript-language-server` via PATH lookup

## Dependencies

- **Runtime**: Node.js 16+ 
- **Language Servers**: 
  - `svelte-language-server@^0.16.14`
  - `typescript-language-server@^4.3.3`
  - `typescript-svelte-plugin@^0.3.40` (automatically configured)
- **LSP Libraries**: vscode-languageserver, vscode-jsonrpc

## Benefits

1. **Simplified Setup**: One LSP connection instead of configuring multiple servers
2. **Unified Experience**: Seamless language support across Svelte file regions  
3. **No Dependencies**: Uses existing, battle-tested language servers
4. **Smart Routing**: Context-aware request routing for optimal performance
5. **Full Feature Support**: All LSP capabilities from both underlying servers

## License

MIT