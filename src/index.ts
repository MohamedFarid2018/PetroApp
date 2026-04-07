import { createApp } from './app';
import { MemoryStore } from './store/MemoryStore';

const port = parseInt(process.env.PORT ?? '8080', 10);

const store = new MemoryStore();
const app = createApp(store);

app.listen(port, () => {
  console.log(`server listening on :${port}`);
});
