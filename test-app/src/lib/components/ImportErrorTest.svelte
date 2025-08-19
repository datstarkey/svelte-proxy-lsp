<script lang="ts">
  import type { ExternalPerson } from "./types";
  import type { NonExistentType } from "./missing-file"; // Should error

  interface Props {
    person: ExternalPerson;
    invalid: NonExistentType; // Should error
  }

  let { person, invalid }: Props = $props();

  // Type mismatch with imported type
  let wrongPerson: ExternalPerson = {
    name: "Test",
    age: "should be Date", // Should error - string instead of Date
    job: "should be Job object" // Should error - string instead of Job
  };
</script>

<main>
  <h1>{person.name}</h1>
  <p>Age: {person.age.toDateString()}</p>
</main>