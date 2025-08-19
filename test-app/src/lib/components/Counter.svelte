<script lang="ts">
	export let initialValue: number = 0;
	export let step: number = 1;
	
	let count = initialValue;
	
	function increment() {
		count += step;
	}
	
	function decrement() {
		count -= step;
	}
	
	function reset() {
		count = initialValue;
	}
</script>

<div class="counter">
	<button on:click={decrement}>-</button>
	<span class="count">{count}</span>
	<button on:click={increment}>+</button>
	<button on:click={reset} class="reset">Reset</button>
</div>

<style>
	.counter {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: white;
	}
	
	.count {
		font-size: 1.5rem;
		font-weight: bold;
		min-width: 3ch;
		text-align: center;
	}
	
	button {
		padding: 0.5rem 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f9f9f9;
		cursor: pointer;
		font-size: 1rem;
	}
	
	button:hover {
		background: #e9e9e9;
	}
	
	.reset {
		margin-left: 1rem;
		background: #ff6b6b;
		color: white;
		border-color: #ff5252;
	}
	
	.reset:hover {
		background: #ff5252;
	}
</style>