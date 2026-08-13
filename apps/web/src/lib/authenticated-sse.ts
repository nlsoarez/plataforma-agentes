type MessageHandler = (data: string) => void;

export function openAuthenticatedSse(url: string, token: string, onMessage: MessageHandler): () => void {
  const controller = new AbortController();

  void (async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`SSE HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const data = frame.split(/\r?\n/)
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n');
            if (data) onMessage(data);
          }
        }
      } catch {
        if (controller.signal.aborted) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  })();

  return () => controller.abort();
}
