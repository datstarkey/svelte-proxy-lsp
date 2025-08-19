import { e as escape_html } from "../../chunks/escaping.js";
import { v as pop, t as push } from "../../chunks/index.js";
const replacements = {
  translate: /* @__PURE__ */ new Map([
    [true, "yes"],
    [false, "no"]
  ])
};
function attr(name, value, is_boolean = false) {
  const normalized = name in replacements && replacements[name].get(value) || value;
  const assignment = is_boolean ? "" : `="${escape_html(normalized, true)}"`;
  return ` ${name}${assignment}`;
}
function _page($$payload, $$props) {
  push();
  let name = "world";
  let count = 0;
  const user = { name: "John", age: 30 };
  $$payload.out.push(`<main class="svelte-1q8e0x1"><h1 class="svelte-1q8e0x1">Welcome to SvelteKit</h1> <p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p> <div class="card svelte-1q8e0x1"><button aria-label="Increment counter" class="svelte-1q8e0x1">count is ${escape_html(count)}</button> <p>Edit <code>src/routes/+page.svelte</code> to test HMR</p></div> <section class="greeting-section svelte-1q8e0x1"><label for="name-input">Enter your name:</label> <input id="name-input"${attr("value", name)} placeholder="Enter name..." type="text" class="svelte-1q8e0x1"/> <button class="svelte-1q8e0x1">Greet</button> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></section> <div class="user-info svelte-1q8e0x1"><h2>User Information</h2> <p>Name: ${escape_html(user.name)}</p> <p>Age: ${escape_html(user.age)}</p></div></main>`);
  pop();
}
export {
  _page as default
};
