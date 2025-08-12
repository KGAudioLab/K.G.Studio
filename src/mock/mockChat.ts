export const mockMessage01 = `
Hi! 👋 I’m trying to understand the differences between **synchronous** and **asynchronous** programming in JavaScript. Can you explain?

Also, it would be great if you could provide:

- A simple example
- Use cases
- A short table comparison

`.trim();

export const mockMessage02 = `
Certainly! Here's a brief overview:

### 📌 Key Differences

| Feature        | Synchronous                 | Asynchronous                        |
|----------------|-----------------------------|-------------------------------------|
| Execution Flow | One task at a time          | Tasks can run in parallel or later  |
| Blocking       | Blocks further execution    | Doesn't block execution             |
| Use Case       | Simple scripts              | Network requests, I/O operations    |

### ✅ Example

#### Synchronous
\`\`\`js
console.log("Start");
console.log("End");
\`\`\`

#### Asynchronous
\`\`\`js
console.log("Start");
setTimeout(() => console.log("Delayed"), 1000);
console.log("End");
\`\`\`

Let me know if you'd like a more advanced example!
`.trim();

export const mockMessage03 = `
Thanks! That helps a lot. 🙌

Now I’m curious:

> What are some real-world scenarios where **async** programming is crucial?

Could you list a few?

Also, do you recommend using \`async/await\` over plain \`Promise.then()\`?
`.trim();

export const mockMessage04 = `
Great question!

### 🌍 Real-World Scenarios

- 🌐 Fetching data from an API
- 💾 Reading/writing to a database
- 📨 Sending/receiving emails
- ⏳ Timers or scheduled tasks

### 🤔 \`async/await\` vs \`.then()\`

\`\`\`js
// Using .then()
fetch('/api/data')
  .then(res => res.json())
  .then(data => console.log(data));

// Using async/await
async function fetchData() {
  const res = await fetch('/api/data');
  const data = await res.json();
  console.log(data);
}
\`\`\`

✅ **Recommendation**: Use \`async/await\` for cleaner, more readable code—especially in complex workflows.

Let me know if you want to dive into error handling next!
`.trim();