export function TelegramMock() {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border-primary bg-bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border-primary px-4 py-3">
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-black text-xs font-bold">
          R
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">Relay Bot</p>
          <p className="text-xs text-text-tertiary">online</p>
        </div>
      </div>

      {/* Chat messages */}
      <div className="p-4 space-y-3">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-xs rounded-2xl rounded-br-sm bg-accent/20 px-4 py-2">
            <p className="text-sm text-text-primary">Refactor the auth module to use JWT tokens</p>
            <p className="text-[10px] text-text-tertiary mt-1 text-right">12:34</p>
          </div>
        </div>

        {/* Bot response */}
        <div className="flex justify-start">
          <div className="max-w-sm rounded-2xl rounded-bl-sm bg-bg-secondary border border-border-primary px-4 py-2">
            <p className="text-xs text-accent font-mono mb-2">Reading src/auth.ts...</p>
            <p className="text-sm text-text-primary">
              I&apos;ll refactor the authentication module to use JWT. Here&apos;s what I&apos;m changing:
            </p>
            <div className="mt-2 rounded-lg bg-bg-code border border-border-primary p-3 font-mono text-xs">
              <p className="text-red-400">- const session = cookies.get(&apos;sid&apos;);</p>
              <p className="text-green-400">+ const token = jwt.verify(bearer);</p>
              <p className="text-red-400">- if (!sessions[session]) return;</p>
              <p className="text-green-400">+ if (!token.sub) return;</p>
            </div>
            <p className="text-[10px] text-text-tertiary mt-2">12:34</p>
          </div>
        </div>

        {/* User follow-up */}
        <div className="flex justify-end">
          <div className="max-w-xs rounded-2xl rounded-br-sm bg-accent/20 px-4 py-2">
            <p className="text-sm text-text-primary">/diff</p>
            <p className="text-[10px] text-text-tertiary mt-1 text-right">12:35</p>
          </div>
        </div>

        {/* Bot diff response */}
        <div className="flex justify-start">
          <div className="max-w-sm rounded-2xl rounded-bl-sm bg-bg-secondary border border-border-primary px-4 py-2">
            <p className="text-sm text-text-primary">
              <span className="text-accent font-medium">3 files changed</span>, 47 insertions(+), 23 deletions(-)
            </p>
            <p className="text-[10px] text-text-tertiary mt-1">12:35</p>
          </div>
        </div>
      </div>
    </div>
  );
}
