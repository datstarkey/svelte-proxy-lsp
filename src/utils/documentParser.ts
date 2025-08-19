import { Position, Range } from 'vscode-languageserver';

export interface DocumentRegion {
  type: 'script' | 'style' | 'template';
  start: Position;
  end: Position;
  lang?: string;
  content: string;
}

export interface ParsedDocument {
  script?: DocumentRegion;
  moduleScript?: DocumentRegion;
  style?: DocumentRegion;
  template: DocumentRegion;
  uri: string;
  version: number;
}

export function parseDocument(uri: string, content: string, version: number): ParsedDocument {
  const lines = content.split('\n');
  const regions: DocumentRegion[] = [];
  
  // Parse script blocks
  const scriptRegex = /<script(?:\s+([^>]*?))?>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  
  while ((scriptMatch = scriptRegex.exec(content)) !== null) {
    const [fullMatch, attributes = '', scriptContent] = scriptMatch;
    const startOffset = scriptMatch.index;
    const endOffset = startOffset + fullMatch.length;
    
    const isModule = /context\s*=\s*["']module["']/.test(attributes);
    const langMatch = /lang\s*=\s*["']([^"']+)["']/.exec(attributes);
    const lang = langMatch ? langMatch[1] : 'javascript';
    
    const startPos = offsetToPosition(content, startOffset + fullMatch.indexOf(scriptContent));
    const endPos = offsetToPosition(content, startOffset + fullMatch.indexOf(scriptContent) + scriptContent.length);
    
    const region: DocumentRegion = {
      type: 'script',
      start: startPos,
      end: endPos,
      lang,
      content: scriptContent
    };
    
    if (isModule) {
      (region as any).isModule = true;
    }
    
    regions.push(region);
  }
  
  // Parse style block
  const styleRegex = /<style(?:\s+([^>]*?))?>([\s\S]*?)<\/style>/gi;
  const styleMatch = styleRegex.exec(content);
  
  if (styleMatch) {
    const [fullMatch, attributes = '', styleContent] = styleMatch;
    const startOffset = styleMatch.index;
    
    const langMatch = /lang\s*=\s*["']([^"']+)["']/.exec(attributes);
    const lang = langMatch ? langMatch[1] : 'css';
    
    const startPos = offsetToPosition(content, startOffset + fullMatch.indexOf(styleContent));
    const endPos = offsetToPosition(content, startOffset + fullMatch.indexOf(styleContent) + styleContent.length);
    
    regions.push({
      type: 'style',
      start: startPos,
      end: endPos,
      lang,
      content: styleContent
    });
  }
  
  // Template is everything else
  const templateStart: Position = { line: 0, character: 0 };
  const templateEnd: Position = { line: lines.length - 1, character: lines[lines.length - 1]?.length || 0 };
  
  const templateRegion: DocumentRegion = {
    type: 'template',
    start: templateStart,
    end: templateEnd,
    content
  };
  
  const result: ParsedDocument = {
    template: templateRegion,
    uri,
    version
  };
  
  // Assign specific regions
  for (const region of regions) {
    if (region.type === 'script') {
      if ((region as any).isModule) {
        result.moduleScript = region;
      } else {
        result.script = region;
      }
    } else if (region.type === 'style') {
      result.style = region;
    }
  }
  
  return result;
}

export function getRegionAtPosition(parsed: ParsedDocument, position: Position): DocumentRegion {
  // Check script regions first (they take precedence)
  if (parsed.script && isPositionInRegion(position, parsed.script)) {
    return parsed.script;
  }
  
  if (parsed.moduleScript && isPositionInRegion(position, parsed.moduleScript)) {
    return parsed.moduleScript;
  }
  
  if (parsed.style && isPositionInRegion(position, parsed.style)) {
    return parsed.style;
  }
  
  // Default to template
  return parsed.template;
}

export function isPositionInRegion(position: Position, region: DocumentRegion): boolean {
  const { start, end } = region;
  
  if (position.line < start.line || position.line > end.line) {
    return false;
  }
  
  if (position.line === start.line && position.character < start.character) {
    return false;
  }
  
  if (position.line === end.line && position.character > end.character) {
    return false;
  }
  
  return true;
}

function offsetToPosition(text: string, offset: number): Position {
  const lines = text.substring(0, offset).split('\n');
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length
  };
}

export function isSvelteFile(uri: string): boolean {
  return uri.endsWith('.svelte');
}

export function shouldUseSvelteServer(parsed: ParsedDocument, position?: Position): boolean {
  // Always use Svelte server for .svelte files
  return isSvelteFile(parsed.uri);
}

export function shouldUseTypeScriptServer(parsed: ParsedDocument, position?: Position): boolean {
  // Use TypeScript server for .js/.ts files
  return !isSvelteFile(parsed.uri) && (
    parsed.uri.endsWith('.ts') || 
    parsed.uri.endsWith('.js') ||
    parsed.uri.endsWith('.tsx') ||
    parsed.uri.endsWith('.jsx')
  );
}