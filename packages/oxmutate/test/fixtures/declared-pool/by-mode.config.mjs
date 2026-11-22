// A config that is a function of the Vite environment: the pool it names depends on both fields.
const byMode = ({ command, mode }) => ({ test: { pool: command === 'serve' && mode === 'test' ? 'forks' : 'threads' } });

export default byMode;
