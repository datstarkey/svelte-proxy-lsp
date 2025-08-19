<script lang="ts">
  type Person = {
    name: string;
    age: number;
  };

  let person: Person = {
    name: "John",
    age: "not a number" // This should cause a TypeScript error
  };

  // Missing property error
  let person2: Person = {
    name: "Jane"
    // missing age property
  };

  // Type mismatch error
  let invalidFunction = (x: number): string => {
    return x; // Should return string, not number
  };
</script>

<main>
  <h1>Hello {person.name}!</h1>
  <p>Age: {person.age}</p>
</main>