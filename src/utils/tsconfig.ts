import * as path from 'path';

export function createTsConfigWithSveltePlugin(workspaceRoot: string) {
  return {
    compilerOptions: {
      target: 'ES2020',
      lib: ['DOM', 'DOM.Iterable', 'ES6'],
      allowJs: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      forceConsistentCasingInFileNames: true,
      moduleResolution: 'node',
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'preserve',
      plugins: [
        {
          name: 'typescript-svelte-plugin',
          enabled: true,
          assumeIsSvelteProject: true
        }
      ]
    },
    include: [
      path.join(workspaceRoot, 'src/**/*'),
      path.join(workspaceRoot, '**/*.svelte')
    ],
    exclude: [
      'node_modules/**/*'
    ]
  };
}

export function getTsServerPluginConfig() {
  try {
    const pluginPath = require.resolve('typescript-svelte-plugin');
    return {
      name: 'typescript-svelte-plugin',
      location: pluginPath,
      enableForWorkspaceTypeScriptVersions: true
    };
  } catch (error) {
    console.warn('typescript-svelte-plugin not found:', error);
    return null;
  }
}