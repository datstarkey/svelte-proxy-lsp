<script lang="ts">
    type Person = {
        name:string,
        age:number,
        dateOfBirth: Date,
    }
    interface Props {
        input: Person;
        
    };

    let {input}:Props = $props();
</script>