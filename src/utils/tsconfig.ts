export function getTsServerPluginConfig() {
  try {
    const pluginPath = require.resolve("typescript-svelte-plugin");
    return {
      name: "typescript-svelte-plugin",
      location: pluginPath,
      enableForWorkspaceTypeScriptVersions: true,
    };
  } catch (error) {
    console.warn("typescript-svelte-plugin not found:", error);
    return null;
  }
}
