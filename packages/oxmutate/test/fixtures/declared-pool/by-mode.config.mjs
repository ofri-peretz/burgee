// A config that is a function of the Vite environment: the pool it names depends on both fields.
export default ({ command, mode }) => ({ test: { pool: command === 'serve' && mode === 'test' ? 'forks' : 'threads' } });
