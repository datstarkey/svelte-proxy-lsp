import { 
  parseDocument, 
  getRegionAtPosition, 
  shouldUseSvelteServer, 
  shouldUseTypeScriptServer,
  isSvelteFile 
} from '../../src/utils/documentParser';

describe('documentParser', () => {
  describe('parseDocument', () => {
    it('should parse a simple Svelte component', () => {
      const content = `<script lang="ts">
  let name: string = 'world';
</script>

<h1>Hello {name}!</h1>

<style>
  h1 { color: red; }
</style>`;

      const parsed = parseDocument('test.svelte', content, 1);

      expect(parsed.uri).toBe('test.svelte');
      expect(parsed.version).toBe(1);
      expect(parsed.script).toBeDefined();
      expect(parsed.script?.lang).toBe('ts');
      expect(parsed.script?.content).toContain('let name: string');
      expect(parsed.style).toBeDefined();
      expect(parsed.style?.content).toContain('color: red');
      expect(parsed.template).toBeDefined();
    });

    it('should handle module script context', () => {
      const content = `<script context="module" lang="ts">
  export const metadata = { title: 'Test' };
</script>

<script lang="ts">
  let count = 0;
</script>

<div>Content</div>`;

      const parsed = parseDocument('test.svelte', content, 1);

      expect(parsed.moduleScript).toBeDefined();
      expect(parsed.moduleScript?.content).toContain('metadata');
      expect(parsed.script).toBeDefined();
      expect(parsed.script?.content).toContain('count');
    });

    it('should handle component without script or style', () => {
      const content = '<h1>Simple component</h1>';

      const parsed = parseDocument('test.svelte', content, 1);

      expect(parsed.script).toBeUndefined();
      expect(parsed.style).toBeUndefined();
      expect(parsed.template).toBeDefined();
      expect(parsed.template.content).toBe(content);
    });

    it('should handle SCSS in style block', () => {
      const content = `<div>Content</div>

<style lang="scss">
  $primary: #ff3e00;
  h1 { color: $primary; }
</style>`;

      const parsed = parseDocument('test.svelte', content, 1);

      expect(parsed.style).toBeDefined();
      expect(parsed.style?.lang).toBe('scss');
      expect(parsed.style?.content).toContain('$primary');
    });
  });

  describe('getRegionAtPosition', () => {
    const svelteContent = `<script lang="ts">
  let name = 'world';
  function greet() {
    console.log('Hello!');
  }
</script>

<main>
  <h1>Hello {name}!</h1>
  <button on:click={greet}>Greet</button>
</main>

<style>
  main {
    padding: 1em;
  }
  h1 {
    color: #ff3e00;
  }
</style>`;

    const parsed = parseDocument('test.svelte', svelteContent, 1);

    it('should identify script region', () => {
      const position = { line: 2, character: 10 }; // Inside 'let name'
      const region = getRegionAtPosition(parsed, position);
      
      expect(region.type).toBe('script');
    });

    it('should identify template region', () => {
      const position = { line: 7, character: 5 }; // Inside template
      const region = getRegionAtPosition(parsed, position);
      
      expect(region.type).toBe('template');
    });

    it('should identify style region', () => {
      // Find the actual style block position by looking at the parsed content
      const styleRegion = parsed.style;
      expect(styleRegion).toBeDefined();
      
      // Use a position that's definitely within the style block
      const position = { 
        line: styleRegion!.start.line + 1, 
        character: 4 
      };
      const region = getRegionAtPosition(parsed, position);
      
      expect(region.type).toBe('style');
    });

    it('should default to template for positions outside specific regions', () => {
      const position = { line: 0, character: 0 }; // Before script
      const region = getRegionAtPosition(parsed, position);
      
      expect(region.type).toBe('template');
    });
  });

  describe('isSvelteFile', () => {
    it('should identify .svelte files', () => {
      expect(isSvelteFile('Component.svelte')).toBe(true);
      expect(isSvelteFile('/path/to/Component.svelte')).toBe(true);
      expect(isSvelteFile('file:///path/to/Component.svelte')).toBe(true);
    });

    it('should reject non-Svelte files', () => {
      expect(isSvelteFile('component.ts')).toBe(false);
      expect(isSvelteFile('component.js')).toBe(false);
      expect(isSvelteFile('styles.css')).toBe(false);
      expect(isSvelteFile('template.html')).toBe(false);
    });
  });

  describe('shouldUseSvelteServer', () => {
    it('should use Svelte server for .svelte files', () => {
      const parsed = parseDocument('test.svelte', '<div>Test</div>', 1);
      expect(shouldUseSvelteServer(parsed)).toBe(true);
    });

    it('should not use Svelte server for non-Svelte files', () => {
      const parsed = parseDocument('test.ts', 'const x = 1;', 1);
      expect(shouldUseSvelteServer(parsed)).toBe(false);
    });
  });

  describe('shouldUseTypeScriptServer', () => {
    it('should use TypeScript server for .ts files', () => {
      const parsed = parseDocument('test.ts', 'const x: number = 1;', 1);
      expect(shouldUseTypeScriptServer(parsed)).toBe(true);
    });

    it('should use TypeScript server for .js files', () => {
      const parsed = parseDocument('test.js', 'const x = 1;', 1);
      expect(shouldUseTypeScriptServer(parsed)).toBe(true);
    });

    it('should not use TypeScript server for .svelte files', () => {
      const parsed = parseDocument('test.svelte', '<div>Test</div>', 1);
      expect(shouldUseTypeScriptServer(parsed)).toBe(false);
    });

    it('should not use TypeScript server for other file types', () => {
      const parsed = parseDocument('test.css', 'body { color: red; }', 1);
      expect(shouldUseTypeScriptServer(parsed)).toBe(false);
    });
  });
});