// A clock in a worker keeps ticking while the page sits in a background tab behind the game;
// timers on the page itself are slowed down there.
let id: ReturnType<typeof setInterval> | null = null;
self.onmessage = (e: MessageEvent<number>) => {
  if (id != null) clearInterval(id);
  id = e.data > 0 ? setInterval(() => self.postMessage(1), e.data) : null;
};
