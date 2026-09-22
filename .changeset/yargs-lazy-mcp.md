---
'burgee': patch
---

`burgee/yargs` loads the MCP server on the `--mcp` branch, not at import.

`yargs/factory.ts` imported `serveMcp` at the top of the file while the note above `#surfaces`
said *"Completions and `--mcp` load lazily, so those two return a promise"*. The note was right
about the shape and wrong about the fact: the branch already returns a promise, so the server
always could have been loaded on it, and until now its **2,520 bytes sat on the startup path of
every `burgee/yargs` program**.

    burgee/yargs, bundled     107,665 B  ->  105,240 B
    burgee/yargs ÷ yargs          0.969  ->  0.947

The same shape as the root-barrel split, missed here because a comment said it had already been
done. The weight lock's `./yargs` budget comes down from 256,000 to 214,800 with it — a ceiling
41 KB above the measurement is not a ratchet.
