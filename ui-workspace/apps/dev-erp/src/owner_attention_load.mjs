/** A stale or disposed fetch can never replace a newer Owner view. */
export function createOwnerAttentionLoader({ read, valid, loading, available, unavailable, settled,
  timeoutMs = 8000 } = {}) {
  let generation = 0, controller = null, closed = false;
  function invalidate() { generation++; controller?.abort(); controller = null; }
  return {
    invalidate,
    close() { closed = true; invalidate(); },
    async refresh() {
      if (closed) return;
      invalidate(); const run = generation; controller = new AbortController();
      loading();
      try {
        const data = await read(AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]));
        if (closed || run !== generation) return;
        if (!valid(data)) throw new Error('요청 정보의 형식을 확인하지 못했습니다.');
        available(data);
      } catch (error) {
        if (closed || run !== generation) return;
        unavailable(['AbortError', 'TimeoutError'].includes(error.name)
          ? '현재 요청 상태를 제시간에 확인하지 못했습니다. 새로 고침으로 다시 확인해 주세요.' : error.message);
      } finally { if (!closed && run === generation) settled(); }
    },
  };
}
