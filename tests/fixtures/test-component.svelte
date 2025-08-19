<script lang="ts">
  export let title: string = 'Hello World';
  export let count: number = 0;
  
  interface ButtonProps {
    label: string;
    variant?: 'primary' | 'secondary';
  }
  
  const buttonProps: ButtonProps = {
    label: 'Click me',
    variant: 'primary'
  };
  
  function handleClick(): void {
    count += 1;
    console.log(`Button clicked ${count} times`);
  }
  
  $: displayText = `${title} - Count: ${count}`;
</script>

<div class="container">
  <h1>{title}</h1>
  <p class="counter-text">{displayText}</p>
  <button 
    class="btn {buttonProps.variant}"
    on:click={handleClick}
  >
    {buttonProps.label}
  </button>
</div>

<style lang="scss">
  .container {
    padding: 2rem;
    text-align: center;
    
    .counter-text {
      font-size: 1.2rem;
      margin: 1rem 0;
    }
  }
  
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    
    &.primary {
      background-color: #007bff;
      color: white;
      
      &:hover {
        background-color: #0056b3;
      }
    }
    
    &.secondary {
      background-color: #6c757d;
      color: white;
      
      &:hover {
        background-color: #545b62;
      }
    }
  }
</style>