<script lang="ts">
	import { onMount } from 'svelte';
	import { greetUser } from '../lib/utils';
	
	let name: string = 'world';
	let count: number = 0;
	let greeting = '';

	interface User {
		name: string;
		age: number;
	}

	const user: User = {
		name: 'John',
		age: 30
	};

	function increment(): void {
		count += 1;
	}

	function handleClick() {
		greeting = greetUser(name);
	}

	onMount(() => {
		console.log('Component mounted');
	});
</script>

<main>
	<h1>Welcome to SvelteKit</h1>
	<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
	
	<div class="card">
		<button on:click={increment} aria-label="Increment counter">
			count is {count}
		</button>
		<p>
			Edit <code>src/routes/+page.svelte</code> to test HMR
		</p>
	</div>

	<section class="greeting-section">
		<label for="name-input">Enter your name:</label>
		<input 
			id="name-input"
			bind:value={name} 
			placeholder="Enter name..." 
			type="text"
		>
		<button on:click={handleClick}>
			Greet
		</button>
		{#if greeting}
			<p class="greeting">{greeting}</p>
		{/if}
	</section>

	<div class="user-info">
		<h2>User Information</h2>
		<p>Name: {user.name}</p>
		<p>Age: {user.age}</p>
	</div>
</main>

<style>
	main {
		text-align: center;
		padding: 1em;
		max-width: 240px;
		margin: 0 auto;
	}

	h1 {
		color: #ff3e00;
		text-transform: uppercase;
		font-size: 4em;
		font-weight: 100;
	}

	.card {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		margin: 0 auto;
	}

	.greeting-section {
		margin: 2rem 0;
		padding: 1rem;
		border: 1px solid #ccc;
		border-radius: 8px;
	}

	.greeting {
		font-weight: bold;
		color: #ff3e00;
	}

	.user-info {
		background-color: #f0f0f0;
		padding: 1rem;
		border-radius: 8px;
		margin-top: 1rem;
	}

	button {
		background-color: #ff3e00;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		margin: 0.25rem;
	}

	button:hover {
		background-color: #da3100;
	}

	input {
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		margin: 0.25rem;
	}

	@media (min-width: 640px) {
		main {
			max-width: none;
		}
	}
</style>